import { pool } from "./db.js";

export type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked";
export type FriendshipState =
    | "none"
    | "self"
    | "incoming_pending"
    | "outgoing_pending"
    | "friends"
    | "blocked";

export type FriendSearchResult = {
    userId: string;
    name: string;
    chessUserId: string;
    friendshipState: FriendshipState;
};

export type IncomingFriendRequest = {
    id: string;
    sender: {
        userId: string;
        name: string;
        chessUserId: string;
    };
    createdAt: string;
};

export type FriendListItem = {
    friendshipId: string;
    user: {
        userId: string;
        name: string;
        chessUserId: string;
    };
    connectedAt: string;
};

export type SendFriendRequestOutcome =
    | "request_sent"
    | "already_pending"
    | "already_friends"
    | "auto_accepted"
    | "blocked"
    | "self"
    | "not_found";

type FriendshipRow = {
    id: string;
    requester_user_id: string;
    addressee_user_id: string;
    status: FriendshipStatus;
};

type UserLookupRow = {
    id: string;
    name: string;
    email: string;
    chess_user_id: string;
};

function formatDisplayName(user: UserLookupRow) {
    const trimmedName = user.name?.trim();
    if (trimmedName) {
        return trimmedName;
    }

    const emailPrefix = user.email?.trim().split("@")[0];
    return emailPrefix || "Unknown Player";
}

async function findUserByChessUserId(chessUserId: string) {
    const result = await pool.query<UserLookupRow>(
        `SELECT id, name, email, chess_user_id
         FROM "user"
         WHERE chess_user_id = $1`,
        [chessUserId]
    );

    return result.rows[0] ?? null;
}

async function getDirectionalRelationships(userId: string, otherUserId: string) {
    const result = await pool.query<FriendshipRow>(
        `SELECT id, requester_user_id, addressee_user_id, status
         FROM friendships
         WHERE (requester_user_id = $1 AND addressee_user_id = $2)
            OR (requester_user_id = $2 AND addressee_user_id = $1)`,
        [userId, otherUserId]
    );

    let outgoing: FriendshipRow | null = null;
    let incoming: FriendshipRow | null = null;

    for (const row of result.rows) {
        if (row.requester_user_id === userId && row.addressee_user_id === otherUserId) {
            outgoing = row;
        } else if (row.requester_user_id === otherUserId && row.addressee_user_id === userId) {
            incoming = row;
        }
    }

    return { outgoing, incoming };
}

function getFriendshipStateFromRows(
    currentUserId: string,
    targetUserId: string,
    outgoing: FriendshipRow | null,
    incoming: FriendshipRow | null
): FriendshipState {
    if (currentUserId === targetUserId) {
        return "self";
    }

    if (outgoing?.status === "accepted" || incoming?.status === "accepted") {
        return "friends";
    }

    if (outgoing?.status === "blocked" || incoming?.status === "blocked") {
        return "blocked";
    }

    if (outgoing?.status === "pending") {
        return "outgoing_pending";
    }

    if (incoming?.status === "pending") {
        return "incoming_pending";
    }

    return "none";
}

export async function searchFriendByChessUserId(
    currentUserId: string,
    chessUserId: string
): Promise<FriendSearchResult | null> {
    const user = await findUserByChessUserId(chessUserId);
    if (!user) {
        return null;
    }

    const { outgoing, incoming } = await getDirectionalRelationships(currentUserId, user.id);
    const friendshipState = getFriendshipStateFromRows(currentUserId, user.id, outgoing, incoming);

    return {
        userId: user.id,
        name: formatDisplayName(user),
        chessUserId: user.chess_user_id,
        friendshipState
    };
}

export async function sendFriendRequestByChessUserId(
    requesterUserId: string,
    chessUserId: string
): Promise<SendFriendRequestOutcome> {
    const targetUser = await findUserByChessUserId(chessUserId);
    if (!targetUser) {
        return "not_found";
    }

    if (targetUser.id === requesterUserId) {
        return "self";
    }

    const { outgoing, incoming } = await getDirectionalRelationships(requesterUserId, targetUser.id);

    if (outgoing?.status === "accepted" || incoming?.status === "accepted") {
        return "already_friends";
    }

    if (outgoing?.status === "blocked" || incoming?.status === "blocked") {
        return "blocked";
    }

    if (outgoing?.status === "pending") {
        return "already_pending";
    }

    if (incoming?.status === "pending") {
        await pool.query(
            `UPDATE friendships
             SET status = 'accepted'
             WHERE id = $1`,
            [incoming.id]
        );
        return "auto_accepted";
    }

    if (outgoing?.status === "declined") {
        await pool.query(
            `UPDATE friendships
             SET status = 'pending'
             WHERE id = $1`,
            [outgoing.id]
        );
        return "request_sent";
    }

    await pool.query(
        `INSERT INTO friendships (requester_user_id, addressee_user_id, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (requester_user_id, addressee_user_id) DO NOTHING`,
        [requesterUserId, targetUser.id]
    );

    return "request_sent";
}

export async function getIncomingFriendRequests(userId: string): Promise<IncomingFriendRequest[]> {
    const result = await pool.query<{
        id: string;
        created_at: string;
        sender_user_id: string;
        sender_name: string;
        sender_email: string;
        sender_chess_user_id: string;
    }>(
        `SELECT
            f.id,
            f.created_at,
            sender.id AS sender_user_id,
            sender.name AS sender_name,
            sender.email AS sender_email,
            sender.chess_user_id AS sender_chess_user_id
         FROM friendships f
         JOIN "user" sender ON sender.id = f.requester_user_id
         WHERE f.addressee_user_id = $1
           AND f.status = 'pending'
         ORDER BY f.created_at DESC`,
        [userId]
    );

    return result.rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        sender: {
            userId: row.sender_user_id,
            name: row.sender_name?.trim() || row.sender_email.split("@")[0] || "Unknown Player",
            chessUserId: row.sender_chess_user_id
        }
    }));
}

export async function getAcceptedFriends(userId: string): Promise<FriendListItem[]> {
    const result = await pool.query<{
        friendship_id: string;
        updated_at: string;
        friend_user_id: string;
        friend_name: string;
        friend_email: string;
        friend_chess_user_id: string;
    }>(
        `SELECT
            f.id AS friendship_id,
            f.updated_at,
            friend.id AS friend_user_id,
            friend.name AS friend_name,
            friend.email AS friend_email,
            friend.chess_user_id AS friend_chess_user_id
         FROM friendships f
         JOIN "user" friend
           ON friend.id = CASE
               WHEN f.requester_user_id = $1 THEN f.addressee_user_id
               ELSE f.requester_user_id
           END
         WHERE (f.requester_user_id = $1 OR f.addressee_user_id = $1)
           AND f.status = 'accepted'
         ORDER BY f.updated_at DESC`,
        [userId]
    );

    return result.rows.map((row) => ({
        friendshipId: row.friendship_id,
        connectedAt: row.updated_at,
        user: {
            userId: row.friend_user_id,
            name: row.friend_name?.trim() || row.friend_email.split("@")[0] || "Unknown Player",
            chessUserId: row.friend_chess_user_id
        }
    }));
}

async function updateIncomingFriendRequestStatus(
    requestId: string,
    currentUserId: string,
    status: "accepted" | "declined"
) {
    const result = await pool.query<{ id: string }>(
        `UPDATE friendships
         SET status = $3
         WHERE id = $1
           AND addressee_user_id = $2
           AND status = 'pending'
         RETURNING id`,
        [requestId, currentUserId, status]
    );

    return result.rows[0] ?? null;
}

export async function acceptIncomingFriendRequest(requestId: string, currentUserId: string) {
    return updateIncomingFriendRequestStatus(requestId, currentUserId, "accepted");
}

export async function rejectIncomingFriendRequest(requestId: string, currentUserId: string) {
    return updateIncomingFriendRequestStatus(requestId, currentUserId, "declined");
}

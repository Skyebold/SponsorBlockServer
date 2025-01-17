import { Request, Response } from "express";
import { isUserVIP } from "../utils/isUserVIP";
import { getHash } from "../utils/getHash";
import { db } from "../databases/databases";
import { Category, Service, VideoID } from "../types/segments.model";
import { UserID } from "../types/user.model";
import { getService } from "../utils/getService";

export async function deleteLockCategoriesEndpoint(req: Request, res: Response): Promise<Response> {
    // Collect user input data
    const videoID = req.body.videoID as VideoID;
    const userID = req.body.userID as UserID;
    const categories = req.body.categories as Category[];
    const service = getService(req.body.service);

    // Check input data is valid
    if (!videoID
        || !userID
        || !categories
        || !Array.isArray(categories)
        || categories.length === 0
    ) {
        return res.status(400).json({
            message: "Bad Format",
        });
    }

    // Check if user is VIP
    const hashedUserID = getHash(userID);
    const userIsVIP = await isUserVIP(hashedUserID);

    if (!userIsVIP) {
        return res.status(403).json({
            message: "Must be a VIP to mark videos.",
        });
    }

    await deleteLockCategories(videoID, categories, service);

    return res.status(200).json({ message: `Removed lock categories entrys for video ${videoID}` });
}

/**
 *
 * @param videoID
 * @param categories If null, will remove all
 * @param service
 */
export async function deleteLockCategories(videoID: VideoID, categories: Category[], service: Service): Promise<void> {
    const entries = (
        await db.prepare("all", 'SELECT * FROM "lockCategories" WHERE "videoID" = ? AND "service" = ?', [videoID, service]))
        .filter((entry: any) => {
            return categories === null || categories.indexOf(entry.category) !== -1;
        });

    for (const entry of entries) {
        await db.prepare(
            "run",
            'DELETE FROM "lockCategories" WHERE "videoID" = ? AND "service" = ? AND "category" = ?',
            [videoID, service, entry.category]
        );
    }
}

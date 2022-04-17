import { Request, Response } from "express";
import { config } from "../config";
import { db, privateDB } from "../databases/databases";
import { skipSegmentsHashKey, skipSegmentsKey } from "../utils/redisKeys";
import { SBRecord } from "../types/lib.model";
import { 
    HashedIP, 
    IPAddress, 
    SegmentUUID,
    Service,
    VideoID,
    VideoIDHash,
    VotableObject,
    VideoData,
    Visibility,
	ChannelID
} from "../types/segments.model";
import { getCategoryActionType } from "../utils/categoryInfo";
import { getHash } from "../utils/getHash";
import { getIP } from "../utils/getIP";
import { Logger } from "../utils/logger";
import { QueryCacher } from "../utils/queryCacher";
import { getReputation } from "../utils/reputation";
import {
    Category,
    CategoryActionType,
    SegmentCache,
	ActionType,
} from "../types/videoSegments.model";
import { getService } from "../utils/getService";
import { getWeightedRandomChoice } from "./getSkipSegments";
import { DescriptionDBSegment, DescriptionSegment } from "../types/descriptionSegments.model";


async function prepareCategorySegments(req: Request, videoID: VideoID, category: Category, segments: DescriptionDBSegment[], cache: SegmentCache = { shadowHiddenSegmentIPs: {} }): Promise<DescriptionSegment[]> {
    const shouldFilter: boolean[] = await Promise.all(segments.map(async (segment) => {
        if (segment.votes < -1 && !segment.required) {
            return false; //too untrustworthy, just ignore it
        }

        //check if shadowHidden
        //this means it is hidden to everyone but the original ip that submitted it
        if (segment.shadowHidden != Visibility.HIDDEN) {
            return true;
        }

        if (cache.shadowHiddenSegmentIPs[videoID] === undefined) cache.shadowHiddenSegmentIPs[videoID] = {};
        if (cache.shadowHiddenSegmentIPs[videoID][segment.timeSubmitted] === undefined) {
            const service = getService(req?.query?.service as string);
            cache.shadowHiddenSegmentIPs[videoID][segment.timeSubmitted] = await privateDB.prepare("all", 'SELECT "hashedIP" FROM "sponsorTimes" WHERE "videoID" = ? AND "timeSubmitted" = ? AND "service" = ?',
                [videoID, segment.timeSubmitted, service]) as { hashedIP: HashedIP }[];
        }

        //if this isn't their ip, don't send it to them
        return cache.shadowHiddenSegmentIPs[videoID][segment.timeSubmitted]?.some((shadowHiddenSegment) => {
            if (cache.userHashedIP === undefined) {
                //hash the IP only if it's strictly necessary
                cache.userHashedIP = getHash((getIP(req) + config.globalSalt) as IPAddress);
            }

            return shadowHiddenSegment.hashedIP === cache.userHashedIP;
        }) ?? false;
    }));

    const filteredSegments = segments.filter((_, index) => shouldFilter[index]);

    const maxSegments = getCategoryActionType(category) === CategoryActionType.Skippable ? 32 : 1;
    return (/*await chooseSegments(filteredSegments, maxSegments))*/ // Not running choose segments for descriptions since server has no awareness of what segments overlap due to supporting changeable descriptions
		filteredSegments.map((chosenSegment) => ({
        category: chosenSegment.category,
        firstCharacters: chosenSegment.firstCharacters,
		lastCharacters: chosenSegment.lastCharacters,
		descriptionHash: chosenSegment.descriptionHash,
		length: chosenSegment.length,
        UUID: chosenSegment.UUID,
        locked: chosenSegment.locked,
        votes: chosenSegment.votes,
        videoDuration: chosenSegment.videoDuration
    })));
}

async function getDescriptionSegmentsByVideoID(req: Request, videoID: VideoID, channelID: ChannelID, categories: Category[],
    requiredSegments: SegmentUUID[], service: Service): Promise<DescriptionSegment[]> {
    const cache: SegmentCache = { shadowHiddenSegmentIPs: {} };
    const segments: DescriptionSegment[] = [];

    try {
        categories = categories.filter((category) => !/[^a-z|_|-]/.test(category));
        if (categories.length === 0) return null;

        const segmentsByCategory: SBRecord<Category, DescriptionDBSegment[]> = (await getDescriptionSegmentsFromDBByVideoID(videoID, channelID, service))
            .filter((segment: DescriptionDBSegment) => categories.includes(segment?.category))
            .reduce((acc: SBRecord<Category, DescriptionDBSegment[]>, segment: DescriptionDBSegment) => {
                if (requiredSegments.includes(segment.UUID)) segment.required = true;

                acc[segment.category] ??= [];
                acc[segment.category].push(segment);

                return acc;
            }, {});

        for (const [category, categorySegments] of Object.entries(segmentsByCategory)) {
            segments.push(...(await prepareCategorySegments(req, videoID, category as Category, categorySegments, cache)));
        }

        return segments;
    } catch (err) {
        if (err) {
            Logger.error(err as string);
            return null;
        }
    }
}

// Commenting out until I better understand how this works / how to implement for descriptions
/*
async function getDescriptionSegmentsByHash(req: Request, hashedVideoIDPrefix: VideoIDHash, categories: Category[],
    requiredSegments: SegmentUUID[], service: Service): Promise<SBRecord<VideoID, VideoData>> {
    const cache: SegmentCache = { shadowHiddenSegmentIPs: {} };
    const segments: SBRecord<VideoID, VideoData> = {};

    try {
        type SegmentWithHashPerVideoID = SBRecord<VideoID, {hash: VideoIDHash, segmentPerCategory: SBRecord<Category, DescriptionDBSegment[]>}>;

        categories = categories.filter((category) => !(/[^a-z|_|-]/.test(category)));
        if (categories.length === 0) return null;

        const segmentPerVideoID: SegmentWithHashPerVideoID = (await getDescriptionSegmentsFromDBByHash(hashedVideoIDPrefix, service))
            .filter((segment: DescriptionDBSegment) => categories.includes(segment?.category))
            .reduce((acc: SegmentWithHashPerVideoID, segment: DescriptionDBSegment) => {
                acc[segment.videoID] = acc[segment.videoID] || {
                    hash: segment.hashedVideoID,
                    segmentPerCategory: {}
                };
                if (requiredSegments.includes(segment.UUID)) segment.required = true;

                acc[segment.videoID].segmentPerCategory[segment.category] ??= [];
                acc[segment.videoID].segmentPerCategory[segment.category].push(segment);

                return acc;
            }, {});

        for (const [videoID, videoData] of Object.entries(segmentPerVideoID)) {
            segments[videoID] = {
                hash: videoData.hash,
                segments: [],
            };

            for (const [category, segmentPerCategory] of Object.entries(videoData.segmentPerCategory)) {
                segments[videoID].segments.push(...(await prepareCategorySegments(req, videoID as VideoID, category as Category, segmentPerCategory, cache)));
            }
        }

        return segments;
    } catch (err) {
        Logger.error(err as string);
        return null;
    }
}
*/

async function getDescriptionSegmentsFromDBByHash(hashedVideoIDPrefix: VideoIDHash, channelID: ChannelID, service: Service): Promise<DescriptionDBSegment[]> {
    const fetchFromDB = () => db
        .prepare(
            "all",
            `SELECT "videoID", "firstCharacters", "lastCharacters", "length", "descriptionHash", "votes", "locked", "UUID", "userID", "category", "reputation", "shadowHidden", "hashedVideoID", "timeSubmitted" FROM "sponsorDescriptions"
            WHERE "hashedVideoID" LIKE ? AND "service" = ? AND "hidden" = 0`,
            [`${hashedVideoIDPrefix}%`, service]
        ) as Promise<DescriptionDBSegment[]>;

    if (hashedVideoIDPrefix.length === 4) {
        return await QueryCacher.get(fetchFromDB, skipSegmentsHashKey(hashedVideoIDPrefix, service));
    }

    return await fetchFromDB();
}

async function getDescriptionSegmentsFromDBByVideoID(videoID: VideoID, channelID: ChannelID, service: Service): Promise<DescriptionDBSegment[]> {
    const fetchFromDB = () => db
        .prepare(
            "all",
            `SELECT "firstCharacters", "lastCharacters", "length", "descriptionHash", "votes", "locked", "UUID", "userID", "category", "reputation", "shadowHidden", "timeSubmitted" FROM "sponsorDescriptions" 
            WHERE "videoID" = ? AND "service" = ? AND "hidden" = 0`,
            [videoID, service]
        ) as Promise<DescriptionDBSegment[]>;

    return await QueryCacher.get(fetchFromDB, skipSegmentsKey(videoID, service));
}

//This function will find segments that are contained inside of eachother, called similar segments
//Only one similar time will be returned, randomly generated based on the sqrt of votes.
//This allows new less voted items to still sometimes appear to give them a chance at getting votes.
//Segments with less than -1 votes are already ignored before this function is called
/*
async function chooseSegments(segments: VideoDBSegment[], max: number): Promise<VideoDBSegment[]> {
    //Create groups of segments that are similar to eachother
    //Segments must be sorted by their startTime so that we can build groups chronologically:
    //1. As long as the segments' startTime fall inside the currentGroup, we keep adding them to that group
    //2. If a segment starts after the end of the currentGroup (> cursor), no other segment will ever fall
    //   inside that group (because they're sorted) so we can create a new one
    const overlappingSegmentsGroups: OverlappingSegmentGroup[] = [];
    let currentGroup: OverlappingSegmentGroup;
    let cursor = -1; //-1 to make sure that, even if the 1st segment starts at 0, a new group is created
    for (const segment of segments) {
        if (segment.startTime >= cursor) {
            currentGroup = { segments: [], votes: 0, reputation: 0, locked: false, required: false };
            overlappingSegmentsGroups.push(currentGroup);
        }

        currentGroup.segments.push(segment);
        //only if it is a positive vote, otherwise it is probably just a sponsor time with slightly wrong time
        if (segment.votes > 0) {
            currentGroup.votes += segment.votes;
        }

        if (segment.userID) segment.reputation = Math.min(segment.reputation, await getReputation(segment.userID));
        if (segment.reputation > 0) {
            currentGroup.reputation += segment.reputation;
        }

        if (segment.locked) {
            currentGroup.locked = true;
        }

        if (segment.required) {
            currentGroup.required = true;
        }

        cursor = Math.max(cursor, segment.endTime);
    }

    overlappingSegmentsGroups.forEach((group) => {
        if (group.required) {
            // Required beats locked
            group.segments = group.segments.filter((segment) => segment.required);
        } else if (group.locked) {
            group.segments = group.segments.filter((segment) => segment.locked);
        }

        group.reputation = group.reputation / group.segments.length;
    });

    //if there are too many groups, find the best ones
    return getWeightedRandomChoice(overlappingSegmentsGroups, max).map(
        //randomly choose 1 good segment per group and return them
        group => getWeightedRandomChoice(group.segments, 1)[0],
    );
}
*/

/**
 *
 * Returns what would be sent to the client.
 * Will respond with errors if required. Returns false if it errors.
 *
 * @param req
 * @param res
 *
 * @returns
 */
async function handleGetDescriptionSegments(req: Request, res: Response): Promise<DescriptionSegment[] | false> {
    const videoID = req.query.videoID as VideoID;
    if (!videoID) {
        res.status(400).send("videoID not specified");
        return false;
    }

	const channelID = req.query.channelID as ChannelID;
    if (!videoID) {
        res.status(400).send("channelID not specified");
        return false;
    }

    // Default to sponsor
    // If using params instead of JSON, only one category can be pulled
    const categories: Category[] = req.query.categories
        ? JSON.parse(req.query.categories as string)
        : req.query.category
            ? Array.isArray(req.query.category)
                ? req.query.category
                : [req.query.category]
            : ["sponsor"];
    if (!Array.isArray(categories)) {
        res.status(400).send("Categories parameter does not match format requirements.");
        return false;
    }

	/*
    const actionTypes: ActionType[] = req.query.actionTypes
        ? JSON.parse(req.query.actionTypes as string)
        : req.query.actionType
            ? Array.isArray(req.query.actionType)
                ? req.query.actionType
                : [req.query.actionType]
            : [ActionType.Skip];
    if (!Array.isArray(actionTypes)) {
        res.status(400).send("actionTypes parameter does not match format requirements.");
        return false;
    }
	*/

    const requiredSegments: SegmentUUID[] = req.query.requiredSegments
        ? JSON.parse(req.query.requiredSegments as string)
        : req.query.requiredSegment
            ? Array.isArray(req.query.requiredSegment)
                ? req.query.requiredSegment
                : [req.query.requiredSegment]
            : [];
    if (!Array.isArray(requiredSegments)) {
        res.status(400).send("requiredSegments parameter does not match format requirements.");
        return false;
    }

    const service = getService(req.query.service, req.body.service);

    const segments = await getDescriptionSegmentsByVideoID(req, videoID, channelID, categories, requiredSegments, service);

    if (segments === null || segments === undefined) {
        res.sendStatus(500);
        return false;
    }

    if (segments.length === 0) {
        res.sendStatus(404);
        return false;
    }

    return segments;
}

async function endpoint(req: Request, res: Response): Promise<Response> {
    try {
        const segments = await handleGetDescriptionSegments(req, res);

        // If false, res.send has already been called
        if (segments) {
            //send result
            return res.send(segments);
        }
    } catch (err) {
        if (err instanceof SyntaxError) {
            return res.status(400).send("Categories parameter does not match format requirements.");
        } else return res.sendStatus(500);
    }
}

export {
    getDescriptionSegmentsByVideoID,
 //   getDescriptionSegmentsByHash,
    endpoint,
    handleGetDescriptionSegments
};

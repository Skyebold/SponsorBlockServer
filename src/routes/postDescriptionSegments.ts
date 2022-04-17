import { config } from "../config";
import { Logger } from "../utils/logger";
import { db, privateDB } from "../databases/databases";
import { getMaxResThumbnail, YouTubeAPI } from "../utils/youtubeApi";
import { getDescriptionSubmissionUUID, getSubmissionUUID } from "../utils/getSubmissionUUID";
import { getIP } from "../utils/getIP";
import { getFormattedTime } from "../utils/getFormattedTime";
import { isUserTrustworthy } from "../utils/isUserTrustworthy";
import { dispatchEvent } from "../utils/webhookUtils";
import { Request, Response } from "express";
import { deleteLockCategories } from "./deleteLockCategories";
import { getCategoryActionType } from "../utils/categoryInfo";
import { QueryCacher } from "../utils/queryCacher";
import { getReputation } from "../utils/reputation";
import { APIVideoData, APIVideoInfo } from "../types/youtubeApi.model";
import { UserID } from "../types/user.model";
import { isUserVIP } from "../utils/isUserVIP";
import { parseUserAgent } from "../utils/userAgent";
import { getService } from "../utils/getService";
import axios from "axios";
import {BaseCategory, BaseDBSegment, ChannelID, SegmentUUID, VideoID} from "../types/segments.model";
import { getHash } from "../utils/getHash";
import { checkUserActiveWarning } from "./postSkipSegments";
import { IncomingDescriptionSegment } from "../types/descriptionSegments.model";
type Category = BaseCategory

type CheckResult = {
    pass: boolean,
    errorMessage: string,
    errorCode: number
};

const CHECK_PASS: CheckResult = {
    pass: true,
    errorMessage: "",
    errorCode: 0
};

function checkInvalidFields(videoID: any, userID: any, segments:any): CheckResult {
    const invalidFields = [];
    const errors = [];
    if (typeof videoID !== "string") {
        invalidFields.push("videoID");
    }
    if (typeof userID !== "string" || userID?.length < 30) {
        invalidFields.push("userID");
        if (userID?.length < 30) errors.push(`userID must be at least 30 characters long`);
    }
	for (const segment of segments) {
		if (typeof segment.firstCharacters !== "string") {
			invalidFields.push("firstCharacters");
		}
		if (typeof segment.lastCharacters !== "string") {
			invalidFields.push("lastCharacters");
		}
		if (typeof segment.length !== "number") {
			invalidFields.push("length");
		}
		if (typeof segment.descriptionHash !== "string") {
			invalidFields.push("descriptionHash");
		}

		if (segment.length < 2)
			errors.push(`segment length too short, must be at least 2 characters long.`);

		if (segment.firstCharacters?.length < 1)
			errors.push(`first characters length too short, must be at least 1 character long.`);

		if (segment.lastCharacters?.length < 1)
			errors.push(`last characters length too short, must be at least 1 character long.`);

		if (segment.firstCharacters?.length > 5)
			errors.push(`first characters length too long, must be no more than 5 characters long.`);

		if (segment.lastCharacters?.length > 5)
			errors.push(`last characters length too long, must be no more than 5 characters long.`);

		if (segment.descriptionHash?.length > 1)
			errors.push(`description hash length too short, must be at least 1 character long.`);
	}

    if (invalidFields.length !== 0) {
        // invalid request
        const formattedFields = invalidFields.reduce((p, c, i) => p + (i !== 0 ? ", " : "") + c, "");
        const formattedErrors = errors.reduce((p, c, i) => p + (i !== 0 ? ". " : " ") + c, "");
        return {
            pass: false,
            errorMessage: `No valid ${formattedFields} field(s) provided.${formattedErrors}`,
            errorCode: 400
        };
    }

    return CHECK_PASS;
}

function preprocessInput(req: Request) {
    const videoID = req.query.videoID || req.body.videoID;
	const channelID = req.query.channelID || req.body.channelID;
    const userID = req.query.userID || req.body.userID;
    const service = getService(req.query.service, req.body.service);

	let segments = req.body.segments as IncomingDescriptionSegment[];
    if (segments === undefined) {
        // Use query instead
        segments = [{
            category: req.query.category as Category,
			length: parseInt(req.query.length as string),
			descriptionHash: req.query.descriptionHash as string,
			firstCharacters: req.query.firstCharacters as string,
			lastCharacters: req.query.lastCharacters as string,
			videoOnly: parseInt(req.query.videoOnly as string)
        }];
    }

    const userAgent = req.query.userAgent ?? req.body.userAgent ?? parseUserAgent(req.get("user-agent")) ?? "";

    return { videoID, channelID, userID, service, segments, userAgent };
}

function proxySubmission(req: Request) {
    axios.post(`${config.proxySubmission}/api/descriptionSegments?userID=${req.query.userID}&videoID=${req.query.videoID}`, req.body)
        .then(res => {
            Logger.debug(`Proxy Submission: ${res.status} (${res.data})`);
        })
        .catch(() => {
            Logger.error("Proxy Submission: Failed to make call");
        });
}

export async function postDescriptionSegments(req: Request, res: Response): Promise<Response> {
    if (config.proxySubmission) {
        proxySubmission(req);
    }

    // eslint-disable-next-line prefer-const
    let { videoID, channelID, userID, service, segments, userAgent } = preprocessInput(req);

    const invalidCheckResult = checkInvalidFields(videoID, userID, segments);
    if (!invalidCheckResult.pass) {
        return res.status(invalidCheckResult.errorCode).send(invalidCheckResult.errorMessage);
    }

    //hash the userID
    userID = getHash(userID);

    const userWarningCheckResult = await checkUserActiveWarning(userID);
    if (!userWarningCheckResult.pass) {
        Logger.warn(`Caught a description submission for a warned user. userID: '${userID}', videoID: '${videoID}'`);
        return res.status(userWarningCheckResult.errorCode).send(userWarningCheckResult.errorMessage);
    }

    //check if this user is on the vip list
    const isVIP = await isUserVIP(userID);

    // Check if all submissions are correct
	let lockedCategoryList:any = []; // TODO: This should probably be checked for in future but was part of a video timings lookup call so I'm just stubbing this in for now...
    const segmentCheckResult = await checkEachSegmentValid(userID, channelID, videoID, segments, service, isVIP, lockedCategoryList);
    if (!segmentCheckResult.pass) {
        return res.status(segmentCheckResult.errorCode).send(segmentCheckResult.errorMessage);
    }

    let decreaseVotes = 0;

	// TODO: Should descriptions support automoderator in future?
	/*
    // Auto check by NB
    const autoModerateCheckResult = await checkByAutoModerator(videoID, userID, segments, isVIP, service, apiVideoInfo, decreaseVotes);
    if (!autoModerateCheckResult.pass) {
        return res.status(autoModerateCheckResult.errorCode).send(autoModerateCheckResult.errorMessage);
    } else {
        decreaseVotes = autoModerateCheckResult.decreaseVotes;
    }
	*/

    // Will be filled when submitting
    const UUIDs = [];
    const newSegments = [];

    //hash the ip 5000 times so no one can get it from the database
    const hashedIP = getHash(getIP(req) + config.globalSalt);

    try {
        //get current time
        const timeSubmitted = Date.now();

        // const rateLimitCheckResult = checkRateLimit(userID, videoID, service, timeSubmitted, hashedIP);
        // if (!rateLimitCheckResult.pass) {
        //     return res.status(rateLimitCheckResult.errorCode).send(rateLimitCheckResult.errorMessage);
        // }

        //check to see if this user is shadowbanned
        const shadowBanRow = await db.prepare("get", `SELECT count(*) as "userCount" FROM "shadowBannedUsers" WHERE "userID" = ? LIMIT 1`, [userID]);

        let shadowBanned = shadowBanRow.userCount;

        if (!(await isUserTrustworthy(userID))) {
            //hide this submission as this user is untrustworthy
            shadowBanned = 1;
        }

        const startingVotes = 0 + decreaseVotes;
        const reputation = await getReputation(userID);

        for (const segmentInfo of segments) {
            //this can just be a hash of the data
            //it's better than generating an actual UUID like what was used before
            //also better for duplication checking
            const UUID = getDescriptionSubmissionUUID(videoID, channelID, userID, service, segmentInfo.descriptionHash, segmentInfo.firstCharacters, segmentInfo.lastCharacters, segmentInfo.length);
            const hashedVideoID = getHash(videoID, 1);

            const startingLocked = isVIP ? 1 : 0;
            try {
				// Set up sponsor description
                await db.prepare("run", `INSERT INTO "sponsorDescriptions" 
                    ("videoID", "channelID", "firstCharacters", "lastCharacters", "length", "descriptionHash", "locked", "UUID", "userID", "timeSubmitted", "views", "category", "service", "reputation", "shadowHidden", "hashedVideoID", "userAgent", "videoOnly")
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    videoID, channelID, segmentInfo.firstCharacters, segmentInfo.lastCharacters, segmentInfo.length, segmentInfo.descriptionHash, startingLocked, UUID, userID, timeSubmitted, 0, segmentInfo.category, service, reputation, shadowBanned, hashedVideoID, userAgent, segmentInfo.videoOnly
                ],
                );

				// Get row of newly inserted sponsor description (it will be needed for initing a vote pair)
				let descriptionID = -1;
				const fetchLastInsertFromDB = await db
					.prepare(
						"get",
						`SELECT last_insert_rowid() as lastInsertedID`,
						[]
					);

				if (fetchLastInsertFromDB !== undefined) {
					descriptionID = fetchLastInsertFromDB.lastInsertedID;
				} 
				
				if (descriptionID == -1)
				{
					throw new Error("Could not get ID of inserted Sponsor Description");
				}

				await db.prepare("run", `INSERT INTO "sponsorDescriptionsPerVideoVotes" 
                    ("descriptionID", "videoID", "channelID", "votes")
                    VALUES(?, ?, ?, ?)`, [
						descriptionID, videoID, channelID, startingVotes
                ],
                );

                //add to private db as well
				// TODO - Private DB support?  I'm not really sure how this works yet
				/*
                await privateDB.prepare("run", `INSERT INTO "sponsorTimes" VALUES(?, ?, ?, ?)`, [videoID, hashedIP, timeSubmitted, service]);

                await db.prepare("run", `INSERT INTO "videoInfo" ("videoID", "channelID", "title", "published", "genreUrl") 
                    SELECT ?, ?, ?, ?, ?
                    WHERE NOT EXISTS (SELECT 1 FROM "videoInfo" WHERE "videoID" = ?)`, [
                    videoID, apiVideoInfo?.data?.authorId || "", apiVideoInfo?.data?.title || "", apiVideoInfo?.data?.published || 0, apiVideoInfo?.data?.genreUrl || "", videoID]);
				*/

                // Clear redis cache for this video
                QueryCacher.clearVideoCache({
                    videoID,
                    hashedVideoID,
                    service,
                    userID
                });
            } catch (err) {
                //a DB change probably occurred
                Logger.error(`Error when putting sponsorDescription in the DB: ${videoID}, ${userID}, ${segmentInfo.category}. ${err}`);
                return res.sendStatus(500);
            }

            UUIDs.push(UUID);
            newSegments.push({
                UUID: UUID,
                category: segmentInfo.category
                //segment: segmentInfo.descriptionHash, // Is this needed...?
            });
        }
    } catch (err) {
        Logger.error(err as string);
        return res.sendStatus(500);
    }

	// TODO - Webhooks support, if desired
	/*
    for (let i = 0; i < segments.length; i++) {
        sendWebhooks(apiVideoInfo, userID, videoID, UUIDs[i], segments[i], service);
    }
	*/
    return res.json(newSegments);
}

async function checkEachSegmentValid(userID: string, videoID: VideoID, channelID: ChannelID,
    segments: IncomingDescriptionSegment[], service: string, isVIP: boolean, lockedCategoryList: Array<any>): Promise<CheckResult> {

    for (let i = 0; i < segments.length; i++) {
        if (segments[i] === undefined || segments[i].descriptionHash === undefined || segments[i].category === undefined || 
			segments[i].firstCharacters === undefined || segments[i].lastCharacters === undefined ||
			segments[i].length === undefined || segments[i].videoOnly === undefined ||  
			(segments[i].videoOnly != 0 && segments[i].videoOnly != 1) // bool
		)
		{
            //invalid request
            return { pass: false, errorMessage: "One of your segments are invalid", errorCode: 400 };
        }

        if (!config.categoryList.includes(segments[i].category)) {
            return { pass: false, errorMessage: "Category doesn't exist.", errorCode: 400 };
        }

        // Reject segment if it's in the locked categories list
        const lockIndex = lockedCategoryList.findIndex(c => segments[i].category === c.category);
        if (!isVIP && lockIndex !== -1) {
            // TODO: Do something about the fradulent submission
            Logger.warn(`Caught a description submission for a locked category. userID: '${userID}', videoID: '${videoID}', category: '${segments[i].category}'`);
            return {
                pass: false,
                errorCode: 403,
                errorMessage:
                    `New submissions are not allowed for the following category: ` +
                    `'${segments[i].category}'. A moderator has decided that no new segments are needed on this video and that all current segments of this category are timed perfectly.\n` +
                    `${lockedCategoryList[lockIndex].reason?.length !== 0 ? `\nLock reason: '${lockedCategoryList[lockIndex].reason}'` : ""}\n` +
                    `${(segments[i].category === "sponsor" ? "\nMaybe the segment you are submitting is a different category that you have not enabled and is not a sponsor. " +
                    "Categories that aren't sponsor, such as self-promotion can be enabled in the options.\n" : "")}` +
                    `\nIf you believe this is incorrect, please contact someone on discord.gg/SponsorBlock or matrix.to/#/#sponsor:ajay.app`
            };
        }

        //check if this info has already been submitted before
        const duplicateCheck2Row = await db.prepare("get", `SELECT COUNT(*) as count FROM "sponsorDescriptions" WHERE "firstCharacters" = ?
            and "lastCharacters" = ? and "category" = ? and "length" = ? and "descriptionHash" = ? and "videoID" = ? and "service" = ?`, 
			[segments[i].firstCharacters, segments[i].lastCharacters, segments[i].category, segments[i].length, segments[i].descriptionHash, videoID, service]);
        if (duplicateCheck2Row.count > 0) {
            return { pass: false, errorMessage: "Sponsors has already been submitted before.", errorCode: 409 };
        }
    }

    return CHECK_PASS;
}
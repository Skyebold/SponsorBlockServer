import { getHash } from "./getHash";
import { HashedValue } from "../types/hash.model";
import { VideoID, Service } from "../types/segments.model";
import { UserID } from "../types/user.model";
import { ActionType } from "../types/videoSegments.model";

export function getSubmissionUUID(
    videoID: VideoID,
    actionType: ActionType,
    userID: UserID,
    startTime: number,
    endTime: number,
    service: Service
) : HashedValue {
    return `5${getHash(`${videoID}${startTime}${endTime}${userID}${actionType}${service}`, 1)}` as HashedValue;
}

export function getDescriptionSubmissionUUID(
    videoID: VideoID,
    userID: UserID,
    service: Service,
	descriptionHash: string,
	firstCharacters: string,  // Up to 5 characters to begin matching against
	lastCharacters: string,  // Up to 5 characters to end matching against
	length: number // Total number of characters to match description segment against
) : HashedValue {
    return `5${getHash(`${videoID}${firstCharacters}${lastCharacters}${descriptionHash}${userID}${length}${service}`, 1)}` as HashedValue;
}
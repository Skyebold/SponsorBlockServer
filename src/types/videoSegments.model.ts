import { SBRecord } from "./lib.model";
import {BaseCategory, BaseDBSegment, HashedIP, SegmentUUID, VideoID} from "./segments.model";
import {UserID} from "./user.model";

export type VideoDuration = number & { __videoDurationBrand: unknown };
export type Category = (BaseCategory | "intro" | "outro" | "preview" | "music_offtopic" | "highlight") & { __categoryBrand: unknown };

export enum ActionType {
    Skip = "skip",
    Mute = "mute",
}

export interface IncomingVideoSegment {
    category: Category;
    segment: string[];
	actionType: ActionType;
}

export interface VideoSegment {
    category: Category;
	actionType: ActionType;
    segment: number[];
    UUID: SegmentUUID;
    videoDuration: VideoDuration;
}

export interface VideoDBSegment extends BaseDBSegment<Category> {
    category: Category;
	actionType: ActionType;
    startTime: number;
    endTime: number;
    videoDuration: VideoDuration;
}

export interface OverlappingSegmentGroup {
    segments: VideoDBSegment[],
    votes: number;
    locked: boolean; // Contains a locked segment
    required: boolean; // Requested specifically from the client
    reputation: number;
}

export interface SegmentCache {
    shadowHiddenSegmentIPs: SBRecord<VideoID, SBRecord<string, {hashedIP: HashedIP}[]>>,
    userHashedIP?: HashedIP
}

export enum CategoryActionType {
    Skippable,
    POI
}

export interface LockCategory {
    category: Category,
    reason: string,
    videoID: VideoID,
    userID: UserID
}

import { SBRecord } from "./lib.model";
import { UserID } from "./user.model";
import {BaseCategory, HashedIP, SegmentUUID, VideoID, VideoIDHash} from "./segments.model";

export type VideoDuration = number & { __videoDurationBrand: unknown };
export type Category = (BaseCategory | "intro" | "outro" | "preview" | "music_offtopic" | "highlight") & { __categoryBrand: unknown };

export interface IncomingSegment {
    category: Category;
    segment: string[];
}

export interface Segment {
    category: Category;
    segment: number[];
    UUID: SegmentUUID;
    videoDuration: VideoDuration;
}

export enum Visibility {
    VISIBLE = 0,
    HIDDEN = 1
}

export interface DBSegment {
    category: Category;
    startTime: number;
    endTime: number;
    UUID: SegmentUUID;
    userID: UserID;
    votes: number;
    locked: boolean;
    required: boolean; // Requested specifically from the client
    shadowHidden: Visibility;
    videoID: VideoID;
    videoDuration: VideoDuration;
    reputation: number;
    hashedVideoID: VideoIDHash;
}

export interface OverlappingSegmentGroup {
    segments: DBSegment[],
    votes: number;
    locked: boolean; // Contains a locked segment
    required: boolean; // Requested specifically from the client
    reputation: number;
}

export interface VideoData {
    hash: VideoIDHash;
    segments: Segment[];
}

export interface SegmentCache {
    shadowHiddenSegmentIPs: SBRecord<VideoID, {hashedIP: HashedIP}[]>,
    userHashedIP?: HashedIP
}

export enum CategoryActionType {
    Skippable,
    POI
}

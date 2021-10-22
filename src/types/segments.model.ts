import {HashedValue} from "./hash.model";
import {UserID} from "./user.model";
import {Category, VideoDuration} from "./videoSegments.model";

export type SegmentUUID = string  & { __segmentUUIDBrand: unknown };
export type VideoID = string & { __videoIDBrand: unknown };
export type BaseCategory = ("sponsor" | "selfpromo" | "interaction") & { __categoryBrand: unknown };
export type VideoIDHash = VideoID & HashedValue;
export type IPAddress = string & { __ipAddressBrand: unknown };
export type HashedIP = IPAddress & HashedValue;

// Uncomment as needed
export enum Service {
    YouTube = "YouTube",
    PeerTube = "PeerTube",
    // Twitch = 'Twitch',
    // Nebula = 'Nebula',
    // RSS = 'RSS',
    // Corridor = 'Corridor',
    // Lbry = 'Lbry'
}

export interface Segment {
    category: Category;
    segment: number[];
    UUID: SegmentUUID;
    videoDuration: VideoDuration;
}

export interface BaseDBSegment<T> {
    category: T;
    startTime: number;
    endTime: number;
    UUID: SegmentUUID;
    userID: UserID;
    votes: number;
    views: number;
    locked: boolean;
    hidden: boolean;
    required: boolean; // Requested specifically from the client
    shadowHidden: Visibility;
    videoID: VideoID;
    videoDuration: VideoDuration;
    reputation: number;
    hashedVideoID: VideoIDHash;
    timeSubmitted: number;
    userAgent: string;
    service: Service;
}

export enum Visibility {
    VISIBLE = 0,
    HIDDEN = 1
}

export interface VotableObject {
    votes: number;
    reputation: number;
}

export interface VotableObjectWithWeight extends VotableObject {
    weight: number;
}

export interface VideoData {
    hash: VideoIDHash;
    segments: Segment[];
}

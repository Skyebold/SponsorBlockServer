import {BaseCategory, BaseDBSegment, SegmentUUID} from "../types/segments.model";
type Category = BaseCategory

export interface IncomingDescriptionSegment {
    category: Category;
    segment: [number, number];
    descriptionHash: string;
}

export interface DescriptionSegment extends IncomingDescriptionSegment {
    UUID: SegmentUUID;
}

export interface DescriptionDBSegment extends BaseDBSegment<Category> {
    category: Category;
    startTime: number;
    endTime: number;
}

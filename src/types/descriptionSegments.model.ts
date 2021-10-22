import {BaseCategory, BaseDBSegment, SegmentUUID} from "./segments.model";

type Category = BaseCategory;

export interface IncomingDescriptionSegment {
    category: Category;    
    descriptionHash: string;
	firstCharacters: string;
	lastCharacters: string;
	length: number;
}

export interface DescriptionSegment extends IncomingDescriptionSegment {
    UUID: SegmentUUID;
}

export interface DescriptionDBSegment extends BaseDBSegment<Category> {
    category: Category;
    descriptionHash: string;
	firstCharacters: string;  // Up to 5 characters to begin matching against
	lastCharacters: string;  // Up to 5 characters to end matching against
	length: number; // Total number of characters to match description segment against
}
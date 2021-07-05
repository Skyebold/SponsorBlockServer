import {BaseCategory} from "./segments.model";

type Category = BaseCategory;

interface IncomingDescriptionSegment {
    category: Category;
    segment: string;
}

export const REVIEWER_ID_PATTERN='^r[0-9]{2,}$';
const pattern=new RegExp(REVIEWER_ID_PATTERN);
export const isReviewerId=value=>typeof value==='string'&&pattern.test(value);

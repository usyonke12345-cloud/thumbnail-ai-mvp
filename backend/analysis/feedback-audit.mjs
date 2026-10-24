import {createHash} from 'node:crypto';
import {SPLIT_VERSION,splitFromDigest} from '../../shared/evaluation-split.mjs';
export {SPLIT_VERSION};
export const groupSplit=id=>/^complete-[a-f0-9]{64}$/.test(id??'')?splitFromDigest(createHash('sha256').update(id).digest()):null;
export const feedbackOf=image=>image.feedbackContext??image.result?.feedbackApplied??null;
export function feedbackUsage(image){const feedbackUsed=!!feedbackOf(image);return {feedbackUsed,feedbackUsageKnown:feedbackUsed||/^ai-complete-0\.(?:[0-5]\.[0-9]+|6\.[01]|[78]\.0|9\.[01]|10\.[012])$/.test(image.result?.generation_version??'')};}
export function feedbackExposure(images){
 const holdoutExposures=[];
 for(const image of images)for(const record of feedbackOf(image)?.records??[])if(groupSplit(record.groupId)==='holdout')holdoutExposures.push({sourceGroupId:record.groupId,consumerImageId:image.id,consumerGroupId:image.groupId});
 return {splitVersion:SPLIT_VERSION,holdoutExposures,contaminatedGroupIds:[...new Set(holdoutExposures.map(x=>x.sourceGroupId))].sort()};
}

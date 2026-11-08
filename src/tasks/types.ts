import type { Place } from '../world/types';

interface TaskBase {
  id: string; from: string; text: string; timeLimitSec: number; reward: number;
  onSuccess?: string; onFail?: string;
}
export interface ChatTask extends TaskBase { type: 'chat'; answers: string[]; correct: number[] }
export interface LikeTask extends TaskBase { type: 'like'; postId: string }
export interface DestinationTask extends TaskBase { type: 'destination'; target: Place['id'] }
export type TaskDef = ChatTask | LikeTask | DestinationTask;

export type TaskEvent =
  | { type: 'started'; task: TaskDef }
  | { type: 'resolved'; task: TaskDef; success: boolean; reply: string };

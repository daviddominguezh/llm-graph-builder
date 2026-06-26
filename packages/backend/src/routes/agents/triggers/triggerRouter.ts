import express from 'express';

import { handleCreateTrigger } from './createTrigger.js';
import { handleDeleteTrigger } from './deleteTrigger.js';
import { handleListTriggers } from './listTriggers.js';
import { handleSetTriggerEnabled } from './setTriggerEnabled.js';

export const triggerRouter = express.Router({ mergeParams: true });

triggerRouter.get('/', handleListTriggers);
triggerRouter.post('/', handleCreateTrigger);
triggerRouter.delete('/:triggerId', handleDeleteTrigger);
triggerRouter.patch('/:triggerId/enabled', handleSetTriggerEnabled);

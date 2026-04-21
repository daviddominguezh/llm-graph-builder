import express from 'express';
import type { Request } from 'express';

import { findConversationById } from '../queries/conversationQueries.js';
import { createNote, deleteNote, getNotes } from '../queries/noteQueries.js';
import type { ConversationNoteRow } from '../types/index.js';
import type { MessagingResponse } from './routeHelpers.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getRequiredParam,
  getSupabase,
} from './routeHelpers.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseStringField(body: unknown, field: string): string {
  if (!isRecord(body)) return '';
  const value: unknown = body[field];
  return typeof value === 'string' ? value : '';
}

function noteToPayload(note: ConversationNoteRow): Record<string, unknown> {
  return {
    noteID: note.id,
    content: note.content,
    creator: note.creator_email,
    timestamp: new Date(note.created_at).getTime(),
  };
}

async function handleGetNotes(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const conversationId = getRequiredParam(req, 'conversationId');

    const conversation = await findConversationById(supabase, conversationId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    const notes = await getNotes(supabase, conversation.id);
    const noteMap: Record<string, unknown> = {};
    for (const note of notes) {
      noteMap[note.id] = noteToPayload(note);
    }

    res.status(HTTP_OK).json({ notes: noteMap });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

async function handleCreateNote(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const conversationId = getRequiredParam(req, 'conversationId');
    const content = parseStringField(req.body, 'content').trim();
    const creator = parseStringField(req.body, 'creator').trim();
    if (creator === '' || content === '') {
      res.status(HTTP_BAD_REQUEST).json({ error: 'creator and content are required' });
      return;
    }

    const conversation = await findConversationById(supabase, conversationId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    const note = await createNote(supabase, conversation.id, creator, content);
    res.status(HTTP_OK).json(noteToPayload(note));
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

async function handleDeleteNote(req: Request, res: MessagingResponse): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const conversationId = getRequiredParam(req, 'conversationId');
    const noteId = getRequiredParam(req, 'noteId');

    const conversation = await findConversationById(supabase, conversationId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    await deleteNote(supabase, noteId, conversation.id);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const notesRouter = express.Router({ mergeParams: true });
notesRouter.get('/:conversationId/notes', handleGetNotes);
notesRouter.post('/:conversationId/notes', handleCreateNote);
notesRouter.delete('/:conversationId/notes/:noteId', handleDeleteNote);

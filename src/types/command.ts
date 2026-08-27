/**
 * Command pattern type definitions.
 */

import type { Api } from './api'

/**
 * Base command interface for undo/redo operations.
 * Note: The type is string to allow interop with JavaScript command classes.
 */
export interface Command {
  /** Command type identifier */
  type: string

  /**
   * Execute the command (for redo operations).
   * @param api - API service
   */
  execute(api: Api): Promise<void>

  /**
   * Undo the command.
   * @param api - API service
   */
  undo(api: Api): Promise<void>

  /**
   * Serialize command to plain object.
   */
  toJSON(): CommandJSON

  /**
   * Get human-readable description of the command.
   */
  getDescription?(): string

  /**
   * Replace every reference to `oldId` with `newId`. Redoing a creation mints a
   * new row id, and the commands queued behind it may still name the old one.
   */
  remapNodeId?(oldId: number, newId: number): void
}

/**
 * Serialized command representation.
 */
export interface CommandJSON {
  type: string
  [key: string]: unknown
}

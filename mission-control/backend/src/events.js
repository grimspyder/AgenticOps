/**
 * Mission Control - Event Bus
 * Bridges REST API changes to WebSocket broadcasts
 */
import { EventEmitter } from 'events';

export const mcEvents = new EventEmitter();
mcEvents.setMaxListeners(20);

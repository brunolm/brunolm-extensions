import { listen } from '../shared/messages.js';
import { registerAll } from '../features/sw.js';

registerAll();
listen();

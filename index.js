import { MODULE_NAME, MODULE_NAME_FANCY } from './src/constants.js';
import { initialize, memory_intercept_messages, get_long_memory, get_short_memory } from './src/main.js';

// Export the functions that SillyTavern needs to see
export { MODULE_NAME, MODULE_NAME_FANCY, memory_intercept_messages, get_long_memory, get_short_memory };

// Initialize the extension
initialize();

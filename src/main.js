import { getContext, extension_settings } from '../../../../extensions.js';
import { scrollChatToBottom, saveSettingsDebounced, amount_gen, system_message_types, main_api, chat_metadata, messageFormatting, CLIENT_VERSION } from '../../../../../script.js';
import { getPresetManager } from '../../../../preset-manager.js';
import { formatInstructModeChat, formatInstructModePrompt } from '../../../../instruct-mode.js';
import { selected_group, openGroupId } from '../../../../group-chats.js';
import { loadMovingUIState, power_user } from '../../../../power-user.js';
import { debounce_timeout } from '../../../../constants.js';
import { MacrosParser } from '../../../../macros.js';
import { commonEnumProviders } from '../../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { t, translate } from '../../../../i18n.js';

import { MODULE_NAME, REQUIRE_ST_VERSION, long_memory_macro, short_memory_macro } from './constants.js';
import { state, setStopSummarization, setSummarizationDelayTimeout, setSummarizationDelayResolve } from './state.js';
import { get_settings, set_settings, initialize_settings, chat_enabled, check_message_exclusion, remember_message_toggle, forget_message_toggle, clear_memory, toggle_memory_value, get_previous_swipe_memory, get_character_key } from './settings.js';
import { log, debug, error, toast, saveChatDebounced, count_tokens, getStringHash, compare_semver } from './utils.js';
import { summarize_text, get_summary_preset, set_preset, get_current_preset, get_summary_connection_profile, get_current_connection_profile, set_connection_profile } from './api.js';
import { update_message_visuals, update_all_message_visuals, progress_bar, remove_progress_bar, initialize_popout, initialize_message_buttons, initialize_group_member_buttons, initialize_slash_commands, initialize_menu_buttons, add_i18n, set_character_enabled_button_states, refresh_settings, load_settings_html, MemoryEditInterface, SummaryPromptEditInterface } from './ui.js';

// Message functions
export function set_data(message, key, value) {
    // store information on the message object
    if (!message.extra) {
        message.extra = {};
    }
    if (!message.extra[MODULE_NAME]) {
        message.extra[MODULE_NAME] = {};
    }

    message.extra[MODULE_NAME][key] = value;

    // Also save on the current swipe info if present
    let swipe_index = message.swipe_id
    if (swipe_index && message.swipe_info?.[swipe_index]) {
        if (!message.swipe_info[swipe_index].extra) {
            message.swipe_info[swipe_index].extra = {};
        }
        message.swipe_info[swipe_index].extra[MODULE_NAME] = structuredClone(message.extra[MODULE_NAME])
    }

    saveChatDebounced();
}
export function get_data(message, key) {
    // get information from the message object
    return message?.extra?.[MODULE_NAME]?.[key];
}
export function get_memory(message) {
    // returns the memory properly prepended with the prefill (if present)
    let memory = get_data(message, 'memory') ?? ""
    let prefill = get_data(message, 'prefill') ?? ""

    // prepend the prefill to the memory if needed
    if (get_settings('show_prefill')) {
        memory = `${prefill}${memory}`
    }
    return memory
}
export function edit_memory(message, text) {
    // perform a manual edit of the memory text

    let current_text = get_memory(message)
    if (text === current_text) return;  // no change
    set_data(message, "memory", text);
    set_data(message, "error", null)  // remove any errors
    set_data(message, "reasoning", null)  // remove any reasoning
    set_data(message, "prefill", null)  // remove any prefill
    set_data(message, "edited", Boolean(text))  // mark as edited if not deleted

    // deleting or adding text to a deleted memory, remove some other flags
    if (!text || !current_text) {
        set_data(message, "exclude", false)
        set_data(message, "remember", false)
    }
}

// Retrieving memories
export function update_message_inclusion_flags() {
    // Update all messages in the chat, flagging them as short-term or long-term memories to include in the injection.
    // This has to be run on the entire chat since it needs to take the context limits into account.
    let context = getContext();
    let chat = context.chat;

    debug("Updating message inclusion flags")

    let separate_long_term = get_settings('separate_long_term')
    let injection_threshold = get_settings('summary_injection_threshold')
    let exclude_messages = get_settings('exclude_messages_after_threshold')
    let keep_last_user_message = get_settings('keep_last_user_message')
    let first_to_inject = chat.length - injection_threshold
    let last_user_message_identified = false

    // iterate through the chat in reverse order and mark the messages that should be included in short-term and long-term memory
    let short_limit_reached = false;
    let long_limit_reached = false;
    let end = chat.length - 1;

    let short_summary = ""  // total concatenated summary so far
    let long_summary = ""  // temp summary storage to check token length
    let new_short_summary = ""
    let new_long_summary = ""

    for (let i = end; i >= 0; i--) {
        let message = chat[i];

        // Mark whether the message is lagging behind the exclusion threshold (even if no summary)
        let lagging = i >= first_to_inject

        // If needed, mark the most recent user message as lagging
        if (exclude_messages && keep_last_user_message && !last_user_message_identified && message.is_user) {
            last_user_message_identified = true
            lagging = true
            debug(`Marked most recent user message as lagging: ${i}`)
        }
        set_data(message, 'lagging', lagging)

        // check for any of the exclusion criteria
        let include = check_message_exclusion(message)
        if (!include) {
            set_data(message, 'include', null);
            continue;
        }

        if (!short_limit_reached) {  // short-term limit hasn't been reached yet
            let memory = get_memory(message)
            if (!memory) {  // If it doesn't have a memory, mark it as excluded and move to the next
                set_data(message, 'include', null)
                continue
            }

            // consider this for short term memories as long as we aren't separating long-term or (if we are), this isn't a long-term
            if (!separate_long_term || !get_data(message, 'remember')) {
                new_short_summary = concatenate_summary(short_summary, message)  // concatenate this summary
                let short_token_size = count_tokens(new_short_summary);
                if (short_token_size > get_short_token_limit()) {  // over context limit
                    short_limit_reached = true;
                } else {  // under context limit
                    set_data(message, 'include', 'short');
                    short_summary = new_short_summary
                    continue
                }
            }
        }

        // if the short-term limit has been reached (or we are separating), check the long-term limit.
        let remember = get_data(message, 'remember');
        if (!long_limit_reached && remember) {  // long-term limit hasn't been reached yet and the message was marked to be remembered
            new_long_summary = concatenate_summary(long_summary, message)  // concatenate this summary
            let long_token_size = count_tokens(new_long_summary);
            if (long_token_size > get_long_token_limit()) {  // over context limit
                long_limit_reached = true;
            } else {
                set_data(message, 'include', 'long');  // mark the message as long-term
                long_summary = new_long_summary
                continue
            }
        }

        // if we haven't marked it for inclusion yet, mark it as excluded
        set_data(message, 'include', null);
    }

    update_all_message_visuals()
}
export function concatenate_summary(existing_text, message, separator=null) {
    // given an existing text of concatenated summaries, concatenate the next one onto it
    let memory = get_memory(message)
    if (!memory) {  // if there's no summary, do nothing
        return existing_text
    }
    separator = separator ?? get_settings('summary_injection_separator')
    return existing_text + separator + memory
}
export function concatenate_summaries(indexes, separator=null) {
    // concatenate the summaries of the messages with the given indexes
    // Excludes messages that don't meet the inclusion criteria

    let context = getContext();
    let chat = context.chat;

    let summary = ""
    // iterate through given indexes
    for (let i of indexes) {
        let message = chat[i];
        summary = concatenate_summary(summary, message, separator)
    }

    return summary
}

export function collect_chat_messages(include) {
    // Get a list of chat message indexes identified by the given criteria
    let context = getContext();
    let indexes = []  // list of indexes of messages

    // iterate in reverse order
    for (let i = context.chat.length-1; i >= 0; i--) {
        let message = context.chat[i];
        if (!get_data(message, 'memory')) continue  // no memory
        if (get_data(message, 'lagging')) continue  // lagging - not injected yet
        if (get_data(message, 'include') !== include) continue  // not the include types we want
        indexes.push(i)
    }

    // reverse the indexes so they are in chronological order
    indexes.reverse()
    return indexes
}
export function get_long_memory() {
    // get the injection text for long-term memory
    let indexes = collect_chat_messages('long')
    if (indexes.length === 0) return ""  // if no memories, return empty

    let text = concatenate_summaries(indexes);
    let template = get_settings('long_template')
    let ctx = getContext();

    // replace memories macro
    return ctx.substituteParamsExtended(template, {[generic_memories_macro]: text});
}
export function get_short_memory() {
    // get the injection text for short-term memory
    let indexes = collect_chat_messages('short')
    if (indexes.length === 0) return ""  // if no memories, return empty

    let text = concatenate_summaries(indexes);
    let template = get_settings('short_template')
    let ctx = getContext();

    // replace memories macro
    return ctx.substituteParamsExtended(template, {[generic_memories_macro]: text});
}

// Add an interception function to reduce the number of messages injected normally
// This has to match the manifest.json "generate_interceptor" key
export function memory_intercept_messages(chat, _contextSize, _abort, type) {
    if (!chat_enabled()) return;   // if memory disabled, do nothing
    if (!get_settings('exclude_messages_after_threshold')) return  // if not excluding any messages, do nothing
    refresh_memory()

    let start = chat.length-1
    if (type === 'continue') start--  // if a continue, keep the most recent message

    // symbol is used to prevent accidentally leaking modifications to permanent chat.
    let IGNORE_SYMBOL = getContext().symbols.ignore

    // Remove any messages that have summaries injected
    for (let i=start; i >= 0; i--) {
        delete chat[i].extra.ignore_formatting
        let message = chat[i]
        let lagging = get_data(message, 'lagging')  // The message should be kept
        chat[i] = structuredClone(chat[i])  // keep changes temporary for this generation
        chat[i].extra[IGNORE_SYMBOL] = !lagging
    }
};


// Summarization
export async function summarize_messages(indexes=null, show_progress=true, skip_initial_delay=true) {
    // Summarize the given list of message indexes (or a single index)
    let ctx = getContext();

    if (indexes === null) {  // default to the mose recent message, min 0
        indexes = [Math.max(chat.length - 1, 0)]
    }
    indexes = Array.isArray(indexes) ? indexes : [indexes]  // cast to array if only one given
    if (!indexes.length) return;

    debug(`Summarizing ${indexes.length} messages`)

     // only show progress if there's more than one message to summarize
    show_progress = show_progress && indexes.length > 1;

    // set stop flag to false just in case
    setStopSummarization(false)

    // optionally block user from sending chat messages while summarization is in progress
    if (get_settings('block_chat')) {
        ctx.deactivateSendButtons();
    }

    // Save the current completion preset (must happen before you set the connection profile because it changes the preset)
    let summary_preset = get_settings('completion_preset');
    let current_preset = await get_current_preset();

    // Get the current connection profile
    let summary_profile = get_settings('connection_profile');
    let current_profile = await get_current_connection_profile()

    // set the completion preset and connection profile for summarization (preset must be set after connection profile)
    await set_connection_profile(summary_profile);
    await set_preset(summary_preset);

    let n = 0;
    for (let i of indexes) {
        if (show_progress) progress_bar('summarize', n+1, indexes.length, "Summarizing");

        // check if summarization was stopped by the user
        if (state.STOP_SUMMARIZATION) {
            log('Summarization stopped');
            break;
        }

        // Wait for time delay if set (only delay first if initial delay set)
        let time_delay = get_settings('summarization_time_delay')
        if (time_delay > 0 && (n > 0 || (n === 0 && !skip_initial_delay))) {
            debug(`Delaying generation by ${time_delay} seconds`)
            if (show_progress) progress_bar('summarize', null, null, "Delaying")
            await new Promise((resolve) => {
                setSummarizationDelayTimeout(setTimeout(resolve, time_delay * 1000));
                setSummarizationDelayResolve(resolve);
            });

            // check if summarization was stopped by the user during the delay
            if (state.STOP_SUMMARIZATION) {
                log('Summarization stopped');
                break;
            }
        }

        await summarize_message(i);
        n += 1;
    }


    // restore the completion preset and connection profile
    await set_connection_profile(current_profile);
    await set_preset(current_preset);

    // remove the progress bar
    if (show_progress) remove_progress_bar('summarize')

    if (state.STOP_SUMMARIZATION) {  // check if summarization was stopped
        setStopSummarization(false)  // reset the flag
    } else {
        debug(`Messages summarized: ${indexes.length}`)
    }

    if (get_settings('block_chat')) {
        ctx.activateSendButtons();
    }

    refresh_memory()

    // Update the memory state interface if it's open
    state.memoryEditInterface.update_table()
}
export async function summarize_message(index) {
    // Summarize a message given the chat index, replacing any existing memories
    // Should only be used from summarize_messages()

    let context = getContext();
    let message = context.chat[index]
    let message_hash = getStringHash(message.mes);

    // clear the reasoning early to avoid showing it when summarizing
    set_data(message, 'reasoning', "")

    // Temporarily update the message summary text to indicate that it's being summarized (no styling based on inclusion criteria)
    // A full visual update with style should be done on the whole chat after inclusion criteria have been recalculated
    update_message_visuals(index, false, "Summarizing...")
    state.memoryEditInterface.update_message_visuals(index, null, false, "Summarizing...")

    // If the most recent message, scroll to the bottom to get the summary in view (affected by ST settings)
    if (index === chat.length - 1) {
        scrollChatToBottom();
    }

    // construct the full summary prompt for the message
    let prompt = await state.summaryPromptEditInterface.create_summary_prompt(index)

    // summarize it
    let summary;
    let err = null;
    try {
        debug(`Summarizing message ${index}...`)
        summary = await summarize_text(prompt)
    } catch (e) {
        if (e === "Clicked stop button") {  // summarization was aborted
            err = "Summarization aborted"
        } else {
            err = e.message
            if (e.message === "No message generated") {
                err = "Empty Response"
            } else {
                error(`Unrecognized error when summarizing message ${index}: ${e}`)
            }
        }
        summary = null
    }

    if (summary) {
        debug("Message summarized: " + summary)

        // stick the prefill on the front and try to parse reasoning
        let prefill = get_settings('prefill')
        let prefilled_summary = summary
        if (prefill) {
            prefilled_summary = `${prefill}${summary}`
        }

        let parsed_reasoning_object = context.parseReasoningFromString(prefilled_summary)
        let reasoning = "";
        if (parsed_reasoning_object?.reasoning) {
            debug("Reasoning parsed: ")
            debug(parsed_reasoning_object)
            reasoning = parsed_reasoning_object.reasoning  // reasoning with prefill
            summary = parsed_reasoning_object.content  // summary (no prefill)
        }

        // The summary that is stored is WITHOUT the prefill, regardless of whether there was reasoning.
        // If there is reasoning, it will be stored with the prefill and the prefill will be empty

        set_data(message, 'memory', summary);
        set_data(message, 'hash', message_hash);  // store the hash of the message that we just summarized
        set_data(message, 'error', null);  // clear the error message
        set_data(message, 'edited', false);  // clear the error message
        set_data(message, 'prefill', reasoning ? "" : get_settings('prefill'))  // store prefill if there was no reasoning.
        set_data(message, 'reasoning', reasoning)
    } else {  // generation failed
        error(`Failed to summarize message ${index}: ${err}`);
        set_data(message, 'error', err || "Summarization failed");  // store the error message
        set_data(message, 'memory', null);  // clear the memory if generation failed
        set_data(message, 'edited', false);  // clear the error message
        set_data(message, 'prefill', null)
        set_data(message, 'reasoning', null)
    }

    // update the message summary text again now with the memory, still no styling
    update_message_visuals(index, false)
    state.memoryEditInterface.update_message_visuals(index, null, false)

    // If the most recent message, scroll to the bottom
    if (index === chat.length - 1) {
        scrollChatToBottom()
    }
}
export function refresh_memory() {
    let ctx = getContext();
    if (!chat_enabled()) { // if chat not enabled, remove the injections
        ctx.setExtensionPrompt(`${MODULE_NAME}_long`, "");
        ctx.setExtensionPrompt(`${MODULE_NAME}_short`, "");
        return;
    }

    debug("Refreshing memory")

    // Update the UI according to the current state of the chat memories, and update the injection prompts accordingly
    update_message_inclusion_flags()  // update the inclusion flags for all messages

    // get the filled out templates
    let long_injection = get_long_memory();
    let short_injection = get_short_memory();

    let long_term_position = get_settings('long_term_position')
    let short_term_position = get_settings('short_term_position')

    // if using text completion, we need to wrap it in a system prompt
    if (main_api !== 'openai') {
        if (long_term_position !== extension_prompt_types.IN_CHAT && long_injection.length) long_injection = formatInstructModeChat("", long_injection, false, true)
        if (short_term_position !== extension_prompt_types.IN_CHAT && short_injection.length) short_injection = formatInstructModeChat("", short_injection, false, true)
    }

    // inject the memories into the templates, if they exist
    ctx.setExtensionPrompt(`${MODULE_NAME}_long`,  long_injection,  long_term_position, get_settings('long_term_depth'), get_settings('long_term_scan'), get_settings('long_term_role'));
    ctx.setExtensionPrompt(`${MODULE_NAME}_short`, short_injection, short_term_position, get_settings('short_term_depth'), get_settings('short_term_scan'), get_settings('short_term_role'));

    return `${long_injection}\n\n...\n\n${short_injection}`  // return the concatenated memory text
}
export const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);

export function stop_summarization() {
    // Immediately stop summarization of the chat
    setStopSummarization(true)  // set the flag
    let ctx = getContext()
    ctx.stopGeneration();  // stop generation on current message
    clearTimeout(state.SUMMARIZATION_DELAY_TIMEOUT)  // clear the summarization delay timeout
    if (state.SUMMARIZATION_DELAY_RESOLVE !== null) state.SUMMARIZATION_DELAY_RESOLVE()  // resolve the delay promise so the await goes through
    log("Aborted summarization.")
}
export function collect_messages_to_auto_summarize() {
    // iterate through the chat in chronological order and check which messages need to be summarized.
    let context = getContext();

    let messages_to_summarize = []  // list of indexes of messages to summarize
    let depth_limit = get_settings('auto_summarize_message_limit')  // how many valid messages back we can go
    let lag = get_settings('summarization_delay');  // number of messages to delay summarization for
    let depth = 0
    debug(`Collecting messages to summarize. Depth limit: ${depth_limit}, Lag: ${lag}`)
    for (let i = context.chat.length-1; i >= 0; i--) {
        // get current message
        let message = context.chat[i];

        // check message exclusion criteria
        let include = check_message_exclusion(message);  // check if the message should be included due to current settings
        if (!include) {
            debug(`ID [${i}]: excluded`)
            continue;
        }

        depth++

        // don't include if below the lag value
        if (depth <= lag) {
            debug(`ID [${i}]: Depth < lag (${depth} < ${lag})`)
            continue
        }

        // Check depth limit (only applies if at least 1)
        if (depth_limit > 0 && depth > depth_limit + lag) {
            debug(`ID [${i}]: Depth > depth limit + lag (${depth} > ${depth_limit} + ${lag})`)
            break;
        }

        // skip messages that already have a summary
        if (get_data(message, 'memory')) {
            debug(`ID [${i}]: Already has a memory`)
            continue;
        }

        // this message can be summarized
        messages_to_summarize.push(i)
        debug(`ID [${i}]: Included`)
    }
    debug(`Messages to summarize (${messages_to_summarize.length}): ${messages_to_summarize}`)
    return messages_to_summarize.reverse()  // reverse for chronological order
}
export async function auto_summarize_chat(skip_initial_delay=true) {
    // Perform automatic summarization on the chat
    log('Auto-Summarizing chat...')
    let messages_to_summarize = collect_messages_to_auto_summarize()

    // If we don't have enough messages to batch, don't summarize
    let messages_to_batch = get_settings('auto_summarize_batch_size');  // number of messages to summarize in a batch
    if (messages_to_summarize.length < messages_to_batch) {
        debug(`Not enough messages (${messages_to_summarize.length}) to summarize in a batch (${messages_to_batch})`)
        messages_to_summarize = []
    }

    let show_progress = get_settings('auto_summarize_progress');
    await summarize_messages(messages_to_summarize, show_progress, skip_initial_delay);
}

// Event handling
export async function on_chat_event(event=null, data=null) {
    // When the chat is updated, check if the summarization should be triggered
    debug("Chat updated: " + event + " " + data)

    const context = getContext();
    let index = data

    switch (event) {
        case 'chat_changed':  // chat was changed
            state.last_message_swiped = null;
            state.last_message = null;
            auto_load_profile();  // load the profile for the current chat or character
            refresh_memory();  // refresh the memory state
            if (context?.chat?.length) {
                scrollChatToBottom();  // scroll to the bottom of the chat (area is added due to memories)
            }
            break;

        case 'message_deleted':   // message was deleted
            state.last_message_swiped = null;
            if (index === state.last_message) state.last_message -= 1;  // If the last message was deleted
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("Message deleted, refreshing memory")
            refresh_memory();
            break;

        case 'before_message':
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing
            if (!get_settings('auto_summarize_on_send')) break;  // if auto-summarize-on-send is disabled, skip
            index = context.chat.length - 1
            if (state.last_message_swiped === index) break;  // this is a swipe, skip
            debug("Summarizing chat before message")
            await auto_summarize_chat();  // auto-summarize the chat
            break;

        case 'user_message':
            state.last_message_swiped = null;
            state.last_message = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing

            // Summarize the chat if "include_user_messages" is enabled
            if (get_settings('include_user_messages')) {
                debug("New user message detected, summarizing")
                await auto_summarize_chat();  // auto-summarize the chat (checks for exclusion criteria and whatnot)
            }

            break;

        case 'char_message':
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!context.groupId && context.characterId === undefined) break; // no characters or group selected
            if (streamingProcessor && !streamingProcessor.isFinished) break;  // Streaming in-progress
            if (state.last_message_swiped === index) {  // this is a swipe
                let message = context.chat[index];
                if (!get_settings('auto_summarize_on_swipe')) break;  // if auto-summarize on swipe is disabled, do nothing
                if (!check_message_exclusion(message)) break;  // if the message is excluded, skip
                if (!get_previous_swipe_memory(message, 'memory')) break;  // if the previous swipe doesn't have a memory, skip
                debug("re-summarizing on swipe")
                await summarize_messages(index);  // summarize the swiped message
                refresh_memory()
            } else if (state.last_message === index) {  // not a swipe, but the same index as last message - must be a continue
                state.last_message_swiped = null
                let message = context.chat[index];
                if (!get_settings("auto_summarize_on_continue")) break;  // if auto_summarize_on_continue is disabled, no nothing
                if (!get_memory(message, 'memory')) break;  // if the message doesn't have a memory, skip.
                debug("re-summarizing on continue")
                await summarize_messages(index);  // summarize the swiped message
                refresh_memory()
            } else { // not a swipe or continue
                state.last_message_swiped = null
                if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing
                if (get_settings("auto_summarize_on_send")) break;  // if auto_summarize_on_send is enabled, don't auto-summarize on character message
                debug("New message detected, summarizing")
                await auto_summarize_chat(get_settings('summarization_time_delay_skip_first'));  // auto-summarize the chat, skipping first delay if needed
            }
            state.last_message = index;
            break;

        case 'message_edited':  // Message has been edited
            state.last_message_swiped = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize_on_edit')) break;  // if auto-summarize on edit is disabled, skip
            if (!check_message_exclusion(context.chat[index])) break;  // if the message is excluded, skip
            if (!get_data(context.chat[index], 'memory')) break;  // if the message doesn't have a memory, skip
            debug("Message with memory edited, summarizing")
            summarize_messages(index);  // summarize that message (no await so the message edit goes through)

            // TODO: I'd like to be able to refresh the memory here, but we can't await the summarization because
            //  then the message edit textbox doesn't close until the summary is done.

            break;

        case 'message_swiped':  // when this event occurs, don't summarize yet (a new_message event will follow)
            state.last_message_swiped = index;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("Message swiped, reloading memory")

            // if this is creating a new swipe, remove the current memory.
            // This is detected when the swipe ID is greater than the last index in the swipes array,
            //  i.e. when the swipe ID is EQUAL to the length of the swipes array, not when it's length-1.
            let message = context.chat[index];
            if (message.swipe_id === message.swipes.length) {
                clear_memory(message)
            }

            refresh_memory()

            // make sure the chat is scrolled to the bottom because the memory will change
            scrollChatToBottom();
            break;

        default:
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug(`Unknown event: "${event}", refreshing memory`)
            refresh_memory();
    }
}

async function check_st_version() {
    // Check to see if the current version of ST is acceptable.
    // Currently checks for the "symbols" property of the global context,
    //   which was added in https://github.com/SillyTavern/SillyTavern/pull/3763#issue-2948421833
    log("Checking ST version: " + CLIENT_VERSION)
    try {
        let parts = CLIENT_VERSION.split(':')
        let version = parts[1]
        log("ST Version: "+version)
        log("Required Version: "+REQUIRE_ST_VERSION)
        if (compare_semver(version, REQUIRE_ST_VERSION) < 0) {
            error(`Incompatible ST Version [${version}], requires [${REQUIRE_ST_VERSION}]`)
        }
    } catch (e) {
        error("Unable to determine ST version.")
    }

}

export async function initialize() {
    log(`Loading extension...`)

    // Read version from manifest.json
    const manifest = await get_manifest();
    const VERSION = manifest.version;
    log(`Version: ${VERSION}`)
    check_st_version()

    // Load settings
    initialize_settings();

    // initialize interfaces
    state.memoryEditInterface = new MemoryEditInterface()
    state.summaryPromptEditInterface = new SummaryPromptEditInterface()

    // load settings html
    await load_settings_html();

    // initialize UI stuff
    initialize_settings_listeners();
    initialize_popout()
    initialize_message_buttons();
    initialize_group_member_buttons();
    initialize_slash_commands();
    initialize_menu_buttons();
    add_i18n()

    // ST event listeners
    let ctx = getContext();
    let eventSource = ctx.eventSource;
    let event_types = ctx.event_types;
    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, (id) => on_chat_event('char_message', id));
    eventSource.on(event_types.USER_MESSAGE_RENDERED, (id) => on_chat_event('user_message', id));
    eventSource.on(event_types.GENERATION_STARTED, (id, stuff, dry) => {if (dry) return; on_chat_event('before_message')})
    eventSource.on(event_types.MESSAGE_DELETED, (id) => on_chat_event('message_deleted', id));
    eventSource.on(event_types.MESSAGE_EDITED, (id) => on_chat_event('message_edited', id));
    eventSource.on(event_types.MESSAGE_SWIPED, (id) => on_chat_event('message_swiped', id));
    eventSource.on(event_types.CHAT_CHANGED, () => on_chat_event('chat_changed'));
    eventSource.on(event_types.MORE_MESSAGES_LOADED, refresh_memory)
    eventSource.on('groupSelected', set_character_enabled_button_states)
    eventSource.on(event_types.GROUP_UPDATED, set_character_enabled_button_states)
    eventSource.on(event_types.SETTINGS_UPDATED, refresh_settings)  // refresh extension settings when ST settings change

    // Global Macros
    MacrosParser.registerMacro(short_memory_macro, () => get_short_memory());
    MacrosParser.registerMacro(long_memory_macro, () => get_long_memory());
}

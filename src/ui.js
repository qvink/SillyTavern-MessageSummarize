import { getContext, extension_settings } from '../../../../extensions.js';
import { dragElement } from '../../../../RossAscends-mods.js';
import { settings_div_id, settings_content_class, MODULE_NAME, long_memory_macro, short_memory_macro, generic_memories_macro, remember_button_class, forget_button_class, summarize_button_class, edit_button_class, css_message_div, css_long_memory, css_short_memory, css_remember_memory, css_exclude_memory, css_lagging_memory, css_removed_message, summary_div_class, summary_reasoning_class, css_edit_textarea, PROGRESS_BAR_ID, group_member_enable_button, group_member_enable_button_highlight } from './constants.js';
import { global_settings, settings_ui_map, default_settings, state } from './state.js';
import { get_settings, set_settings, get_short_token_limit, get_long_token_limit, chat_enabled, toggle_chat_enabled, character_enabled, toggle_character_enabled, reset_settings, load_profile } from './settings.js';
import { log, toast, get_current_character_identifier, get_current_chat_identifier, assign_and_prune, check_objects_different, assign_defaults, clean_string_for_html, escape_string, unescape_string, regex, debug } from './utils.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { download, parseJsonFile, copyText, stringToRange } from '../../../../utils.js';
import { t, translate } from '../../../../i18n.js';
import { get_current_preset, get_presets, check_preset_valid, get_connection_profiles, check_connection_profile_valid, get_summary_preset_max_tokens, get_connection_profile_api, get_summary_connection_profile } from './api.js';
import { get_data, get_memory, edit_memory, remember_message_toggle, forget_message_toggle, clear_memory, check_message_exclusion, concatenate_summaries, get_long_memory, get_short_memory, refresh_memory, stop_summarization } from './main.js';
import { getRegexScripts, runRegexScript } from '../../../../scripts/extensions/regex/index.js';
import { createRawPrompt, messageFormatting, scrollChatToBottom } from '../../../../script.js';

export async function load_settings_html() {
    const settings_html = `
    <div id="qvink_memory_settings" class="qvink_memory_settings_content">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <div class="flex-container alignitemscenter margin0">
                    <b id="qvink_title" title="aka: Message Summarize">Qvink Memory</b>
                    <i id="qvink_popout_button" title="Move config to floating popout" class="fa-solid fa-window-restore menu_button margin0"></i>
                </div>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="qvink_memory_settings_content">
                    <hr>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="toggle_chat_memory" class="menu_button flex2" title="Toggle whether memory is enabled for this chat specifically (overrides all settings)."><span>Toggle Memory</span></button>
                        <button id="edit_memory_state" class="menu_button flex2" title="Edit the memories in chat."><span>Edit Memory</span></button>
                        <button id="refresh_memory" class="menu_button fa-solid fa-sync margin0" title="Just refreshes which memories are included and re-renders the memories under each message, doesn't change summaries. This is done automatically all the time, the button is here just in case."></button>
                    </div>
                    <hr>
                    <div>
                        <div class="flex-container justifyspacebetween alignitemscenter" style="margin: auto; width: fit-content;">
                            <h4 class="textAlignCenter">Configuration Profiles</h4>
                            <button id="import_profile"     class="menu_button fa-solid fa-file-import"    title="Import a config profile"></button>
                            <button id="export_profile"     class="menu_button fa-solid fa-file-export"    title="Export the last saved version of the current profile"></button>
                            <input id="import_file" type="file" hidden="" accept=".json">
                        </div>
                    </div>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <select id="profile"            class="flex1 text_pole"                                 title="The currently selected profile"></select>
                        <button id="save_profile"       class="menu_button fa-solid fa-save interactable"       title="Save current profile" tabindex="0"></button>
                        <button id="rename_profile"     class="menu_button fa-solid fa-pencil interactable"     title="Rename current profile" tabindex="0"></button>
                        <button id="new_profile"        class="menu_button fa-solid fa-file-circle-plus interactable" title="Create new profile" tabindex="0"></button>
                        <button id="restore_profile"    class="menu_button fa-solid fa-recycle interactable"    title="Restore current profile" tabindex="0"></button>
                        <button id="delete_profile"     class="menu_button fa-solid fa-trash-can interactable"  title="Delete current profile" tabindex="0"></button>
                    </div>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="character_profile" class="menu_button interactable" title="Auto-load profile for current character or group" tabindex="0"><i class="fa-solid fa-unlock" style="margin-right: 1em"></i>Character</button>
                        <button id="chat_profile"      class="menu_button interactable" title="Auto-load profile for current chat"      tabindex="0"><i class="fa-solid fa-unlock" style="margin-right: 1em"></i>Chat</button>
                        <label class="checkbox_label" title="Show a notification upon switching profiles">
                            <input id="notify_on_profile_switch" type="checkbox" />
                            <span>Notify on Switch</span>
                        </label>
                    </div>
                    <hr>
                    <h4 class="textAlignCenter">Summarization <i class="fa-solid fa-info-circle" title="Customize the prompt used to summarize a given message"></i></h4>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="edit_summary_prompt" class="menu_button flex1" title="Edit the summary prompt" >Edit</button>
                        <button id="stop_summarization" class="menu_button fa-solid fa-stop" title="Stop all summarization immediately."></button>
                    </div>
                    <table>
                        <tr title="The connection profile to use for summaries. Note that choosing a different profile will require temporarily switching to the profile during summarization, discarding any unsaved changes to the current profile.">
                            <td><span>Connection Profile</span></td>
                            <td><select id="connection_profile" class="text_pole"></select></td>
                        </tr>
                        <tr title="The completion preset to use for summaries. Note that choosing a different preset will require temporarily switching to that preset during summarization, discarding any unsaved changes to the current preset. Also be aware that presets are not shared between connection APIs.">
                            <td><span>Completion Preset</span></td>
                            <td><select id="completion_preset" class="text_pole"></select></td>
                        </tr>
                    </table>
                    <hr>
                    <label title="Editing a message will trigger a re-summarization if it has already been summarized." class="checkbox_label">
                        <input id="auto_summarize_on_edit" type="checkbox" />
                        <span>Re-summarize on Edit</span>
                    </label>
                    <label title="Swiping a message will trigger a re-summarization if it has already been summarized." class="checkbox_label">
                        <input id="auto_summarize_on_swipe" type="checkbox" />
                        <span>Re-summarize on Swipe</span>
                    </label>
                    <label title="Continuing a message will trigger a re-summarization if it has already been summarized." class="checkbox_label">
                        <input id="auto_summarize_on_continue" type="checkbox" />
                        <span>Re-summarize on Continue</span>
                    </label>
                    <label title="Block chat input while summarizing." class="checkbox_label">
                        <input id="block_chat" type="checkbox" />
                        <span>Block Chat</span>
                    </label>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <label class="checkbox_label" title="Time in seconds to wait before summarizing. May be needed if you are using a external API with a rate limit.">
                            <input id="summarization_time_delay" class="text_pole widthUnset inline_setting" type="number" min="0" max="999" />
                            <span>Time Delay</span>
                        </label>
                        <label class="checkbox_label" title="When auto-summarizing, don't delay the first summary right after a character message.">
                            <input id="summarization_time_delay_skip_first" type="checkbox"/>
                            <span>Skip First</span>
                        </label>
                    </div>
                    <hr>
                    <h4 class="textAlignCenter">Auto-Summarization <i class="fa-solid fa-info-circle" title="Automatically perform summarizations when messages are sent. A message will only be auto-summarized if that summary would be included in short-term memory."></i></h4>
                    <label class="checkbox_label" title="Enable / Disable.">
                        <input id="auto_summarize" type="checkbox" />
                        <span>Auto Summarize</span>
                    </label>
                    <label class="checkbox_label" title="Auto-summarization will be triggered before a new message is sent instead of after.">
                        <input id="auto_summarize_on_send" type="checkbox" />
                        <span>Before Generation</span>
                    </label>
                    <label title="Show the progress bar when auto-summarizing more than 1 message." class="checkbox_label">
                        <input id="auto_summarize_progress" type="checkbox" />
                        <span>Progress Bar</span>
                    </label>
                    <label class="checkbox_label" title="Number of messages to wait before auto-summarizing a message (0 = summarize up to the most recent message, 1 = wait one message, etc.)">
                        <input id="summarization_delay" class="text_pole widthUnset inline_setting" type="number" min="0" max="999" />
                        <span>Message Lag</span>
                    </label>
                    <label class="checkbox_label" title="Wait until this many messages before auto-summarizing them all in sequence (1 = summarize every message immediately, 2 = summarize when you have two ready, etc). Still summarizes one at a time. ">
                        <input id="auto_summarize_batch_size" class="text_pole widthUnset inline_setting" type="number" min="1" max="999" />
                        <span>Batch Size</span>
                    </label>
                    <label class="checkbox_label" title="The maximum amount of lookback when checking for messages to summarize (-1 to disable). For example, 10 means that when auto-summarizing, the 10 most recent valid summarization targets will be checked, and those without summaries will be summarized.">
                        <input id="auto_summarize_message_limit" class="text_pole widthUnset inline_setting" type="number" min="-1" max="999" />
                        <span>Message Limit</span>
                    </label>
                    <hr>
                    <h4 class="textAlignCenter">General Injection Settings <i class="fa-solid fa-info-circle" title="Determines how summaries are injected into context, applying to both short and long term memory."></i></h4>
                    <label title="Separator between summaries when injected into context." class="checkbox_label">
                        <input id="summary_injection_separator" class="text_pole" type="text" placeholder="" style="width: 5em">
                        <span>Summary Separator</span>
                    </label>
                    <label title="The number of messages to wait before summaries start to be injected." class="checkbox_label">
                        <input id="summary_injection_threshold" class="text_pole widthUnset" type="number" min="0" max="999" />
                        <span>Start Injecting After</span>
                    </label>
                    <label title="Messages after the summary injection threshold above will be removed from context, leaving only the summaries." class="checkbox_label">
                        <input id="exclude_messages_after_threshold" type="checkbox">
                        <span>Remove Messages After Threshold</span>
                    </label>
                    <label title="This will keep the most recent user message in context even if it's past the exclusion threshold" class="checkbox_label">
                        <input id="keep_last_user_message" type="checkbox">
                        <span>Preserve Last User Message</span>
                    </label>
                    <label title="In Static Memory Mode, long-term memories are always injected separately from short-term memories, regardless of chronological order. This is in contrast to the default behavior where summaries are kept in short-term memory until the context fills up, then dynamically moved to long-term memory if marked as such." class="checkbox_label">
                        <input id="separate_long_term" type="checkbox">
                        <span>Static Memory Mode</span>
                    </label>
                    <hr>
                    <h4 class="textAlignCenter">Short-term Memory Injection <i class="fa-solid fa-info-circle" title="Determines which messages are included in the short-term memory injection and where. If you change this and include messages that weren't summarized previously, you can either manually trigger a re-summarization or just wait until automatic summarization triggers."></i></h4>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="edit_short_term_memory_prompt" class="menu_button flex1" title="Edit the short-term memory prompt"><span>Edit</span></button>
                    </div>
                    <label title="Auto-summarize user messages and include summaries in memory." class="checkbox_label">
                        <input id="include_user_messages" type="checkbox" />
                        <span>Include User Messages</span>
                    </label>
                    <label title="Auto-summarize hidden messages and include summaries in memory (messages excluded from context)." class="checkbox_label">
                        <input id="include_system_messages" type="checkbox" />
                        <span>Include Hidden Messages</span>
                    </label>
                    <label title="Auto-summarize system messages and include summaries in memory (e.g. messages from the /sys command)." class="checkbox_label">
                        <input id="include_narrator_messages" type="checkbox" />
                        <span>Include System Messages</span>
                    </label>
                    <label title="The minimum token length a message has to be in order to get summarized.">
                        <input id="message_length_threshold" class="text_pole widthUnset inline_setting" type="number" min="0" max="999" />
                        <span>Message Length Threshold</span>
                    </label>
                    <br>
                    <div class="flex-container justifyspacebetween">
                        <label title="The max amount of context that short-term memory can take up (percent or number of tokens).">
                            <input id="short_term_context_limit" class="text_pole widthUnset inline_setting" type="number" min="0" max="99999" />
                            <span>Context (<span id="short_term_context_limit_display"></span> tk)</span>
                        </label>
                        <div>
                            <label>
                                <input type="radio" name="short_term_context_type" value="percent" />
                                <span>%</span>
                            </label>
                            <label>
                                <input type="radio" name="short_term_context_type" value="tokens" />
                                <span>tk</span>
                            </label>
                        </div>
                    </div>
                    <label class="checkbox_label" title="Include short-term memory in the World Info Scan">
                        <input id="short_term_scan" type="checkbox" />
                        <span>Include in World Info Scanning</span>
                    </label>
                    <div class="radio_group">
                        <label title="You can instead inject it into your story string manually with the {{short_term_memory}} macro">
                            <input type="radio" name="short_term_position" value="-1" />
                            <span>Do not inject</span>
                        </label>
                        <label>
                            <input type="radio" name="short_term_position" value="2" />
                            <span>Before main prompt</span>
                        </label>
                        <label>
                            <input type="radio" name="short_term_position" value="0" />
                            <span>After main prompt</span>
                        </label>
                        <label class="flex-container alignItemsCenter" title="How many messages before the current end of the chat.">
                            <input type="radio" name="short_term_position" value="1" />
                            <span>In chat at depth</span>
                            <input id="short_term_depth" class="text_pole inline_setting" type="number" min="0" max="99" />
                            <span>as</span>
                            <select id="short_term_role" class="text_pole inline_setting">
                                <option value="0">System</option>
                                <option value="1">User</option>
                                <option value="2">Assistant</option>
                            </select>
                        </label>
                    </div>
                    <hr>
                    <h4 class="textAlignCenter">Long-Term Memory Injection <i class="fa-solid fa-info-circle" title="Determines where long-term messages are injected."></i></h4>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="edit_long_term_memory_prompt" class="menu_button flex1" title="Edit the long-term memory prompt"><span>Edit</span></button>
                    </div>
                    <div class="flex-container justifyspacebetween">
                        <label title="The max amount of the context that long-term memory can take up (percent or number of tokens).">
                            <input id="long_term_context_limit" class="text_pole widthUnset inline_setting" type="number" min="0" max="99999" />
                            <span>Context (<span id="long_term_context_limit_display"></span> tk)</span>
                        </label>
                       <div>
                            <label>
                                <input type="radio" name="long_term_context_type" value="percent" />
                                <span>%</span>
                            </label>
                            <label>
                                <input type="radio" name="long_term_context_type" value="tokens" />
                                <span>tk</span>
                            </label>
                        </div>
                    </div>
                    <label class="checkbox_label" title="Include long-term memory in the World Info Scan">
                        <input id="long_term_scan" type="checkbox" />
                        <span>Include in World Info Scanning</span>
                    </label>
                    <div class="radio_group">
                        <label title="You can instead inject it into your story string manually with the {{long_term_memory}} macro">
                            <input type="radio" name="long_term_position" value="-1" />
                            <span>Do not inject</span>
                        </label>
                        <label>
                            <input type="radio" name="long_term_position" value="2" />
                            <span>Before main prompt</span>
                        </label>
                        <label>
                            <input type="radio" name="long_term_position" value="0" />
                            <span>After main prompt</span>
                        </label>
                        <label class="flex-container alignItemsCenter" title="How many messages before the current end of the chat.">
                            <input type="radio" name="long_term_position" value="1" />
                            <span>In chat at depth</span>
                            <input id="long_term_depth" class="text_pole inline_setting" type="number" min="0" max="99" />
                            <span>as</span>
                            <select id="long_term_role" class="text_pole inline_setting">
                                <option value="0">System</option>
                                <option value="1">User</option>
                                <option value="2">Assistant</option>
                            </select>
                        </label>
                    </div>
                    <hr>
                    <h4 class="textAlignCenter">Misc.</h4>
                    <label title="Fill your console with debug messages" class="checkbox_label">
                        <input id="debug_mode" type="checkbox" />
                        <span>Debug Mode</span>
                    </label>
                    <label title="Display summarizations below each message" class="checkbox_label">
                        <input id="display_memories" type="checkbox" />
                        <span>Display Memories</span>
                    </label>
                    <label title="Whether memory is enabled by default for new chats." class="checkbox_label">
                        <input id="default_chat_enabled" type="checkbox" />
                        <span>Enable Memory in New Chats</span>
                    </label>
                    <label title="Uses a global on/off state for the extension shared between all chats with this enabled. If you enable this option, toggling memory on/off will also toggle memory in other chats that also have this option enabled. When disabled, toggling memory on/off only applies to the active chat." class="checkbox_label">
                        <input id="use_global_toggle_state" type="checkbox" />
                        <span>Use Global Toggle State</span>
                    </label>
                    <div class="flex-container justifyspacebetween alignitemscenter">
                        <button id="revert_settings" class="menu_button flex1 margin0" title="Revert all settings to default (not the default profile, just the default that comes with the extension). Your other profiles won't be affected.">
                            <span>Revert Settings</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
    $("#extensions_settings2").append(settings_html);
}

function map_settings_to_ui() {
    Object.keys(default_settings).forEach(key => {
        settings_ui_map[key] = $(`#${key}`);
    });
}

function load_settings_ui() {
    log("Loading UI settings...");
    load_profile();

    for (const key in settings_ui_map) {
        const $element = settings_ui_map[key];
        const value = get_settings(key);

        if ($element.is(':checkbox')) {
            $element.prop('checked', value);
        } else if ($element.is('select') || $element.is(':text') || $element.is(':number')) {
            $element.val(value);
        }
    }

    // Handle radio buttons separately
    $('input[name="short_term_context_type"]').val([get_settings('short_term_context_type')]);
    $('input[name="long_term_context_type"]').val([get_settings('long_term_context_type')]);
    $('input[name="short_term_position"]').val([get_settings('short_term_position')]);
    $('input[name="long_term_position"]').val([get_settings('long_term_position')]);

    update_token_displays();
    update_profile_buttons();
}

export function initialize_settings_listeners() {
    log("Adding event listeners...");

    map_settings_to_ui();
    load_settings_ui();

    Object.keys(settings_ui_map).forEach(key => {
        const $element = settings_ui_map[key];
        $element.on('change', () => {
            let value;
            if ($element.is(':checkbox')) {
                value = $element.prop('checked');
            } else {
                value = $element.val();
                if (typeof default_settings[key] === 'number') {
                    value = Number(value);
                }
            }
            set_settings(key, value);
            if (key.includes('context_limit') || key.includes('context_type')) {
                update_token_displays();
            }
        });
    });

    // Radio buttons
    $('input[name="short_term_context_type"]').on('change', function() { set_settings('short_term_context_type', $(this).val()); update_token_displays(); });
    $('input[name="long_term_context_type"]').on('change', function() { set_settings('long_term_context_type', $(this).val()); update_token_displays(); });
    $('input[name="short_term_position"]').on('change', function() { set_settings('short_term_position', $(this).val()); });
    $('input[name="long_term_position"]').on('change', function() { set_settings('long_term_position', $(this).val()); });


    // Profiles
    $('#profile').on('change', function() {
        set_settings('profile', $(this).val());
        load_settings_ui();
    });

    $('#new_profile').on('click', () => {
        const profile_name = prompt("Enter new profile name:");
        if (profile_name && !get_settings('profiles')[profile_name]) {
            let profiles = get_settings('profiles');
            profiles[profile_name] = { ...default_settings };
            set_settings('profiles', profiles);
            set_settings('profile', profile_name);
            populate_profile_select();
            load_settings_ui();
        } else if (profile_name) {
            toast("Profile name already exists.", "error");
        }
    });

    $('#save_profile').on('click', () => {
        saveSettingsDebounced();
        toast("Profile saved.", "success");
    });

    $('#delete_profile').on('click', () => {
        const profile_name = get_settings('profile');
        if (profile_name === 'Default') {
            toast("Cannot delete the Default profile.", "error");
            return;
        }
        if (confirm(`Are you sure you want to delete the profile "${profile_name}"?`)) {
            let profiles = get_settings('profiles');
            delete profiles[profile_name];
            set_settings('profiles', profiles);
            set_settings('profile', 'Default');
            populate_profile_select();
            load_settings_ui();
        }
    });

    $('#character_profile').on('click', function() {
        const char_id = get_current_character_identifier();
        let char_profiles = get_settings('character_profiles');
        if (char_profiles[char_id] === get_settings('profile')) {
            delete char_profiles[char_id];
            $(this).find('i').removeClass('fa-lock').addClass('fa-unlock');
        } else {
            char_profiles[char_id] = get_settings('profile');
            $(this).find('i').removeClass('fa-unlock').addClass('fa-lock');
        }
        set_settings('character_profiles', char_profiles);
    });

    $('#chat_profile').on('click', function() {
        const chat_id = get_current_chat_identifier();
        let chat_profiles = get_settings('chat_profiles');
        if (chat_profiles[chat_id] === get_settings('profile')) {
            delete chat_profiles[chat_id];
            $(this).find('i').removeClass('fa-lock').addClass('fa-unlock');
        } else {
            chat_profiles[chat_id] = get_settings('profile');
            $(this).find('i').removeClass('fa-unlock').addClass('fa-lock');
        }
        set_settings('chat_profiles', chat_profiles);
    });

    $('#revert_settings').on('click', () => {
        if (confirm("Are you sure you want to revert all settings for the current profile to their defaults?")) {
            reset_settings();
        }
    });

    $('#import_profile').on('click', () => $('#import_file').click());
    $('#import_file').on('change', async function(event) {
        const file = event.target.files[0];
        if (file) {
            const profile_data = await parseJsonFile(file);
            const profile_name = file.name.replace('.json', '');
            let profiles = get_settings('profiles');
            profiles[profile_name] = profile_data;
            set_settings('profiles', profiles);
            set_settings('profile', profile_name);
            populate_profile_select();
            load_settings_ui();
            toast(`Profile "${profile_name}" imported.`, "success");
        }
    });

    $('#export_profile').on('click', () => {
        const profile_name = get_settings('profile');
        const profile_data = get_settings('profiles')[profile_name];
        download(JSON.stringify(profile_data, null, 4), `${profile_name}.json`, 'application/json');
    });

    $('#toggle_chat_memory').on('click', () => toggle_chat_enabled());
    $('#edit_memory_state').on('click', () => state.memoryEditInterface.open());
    $('#refresh_memory').on('click', () => refresh_memory());
    $('#edit_summary_prompt').on('click', () => state.summaryPromptEditInterface.open());
    $('#stop_summarization').on('click', () => stop_summarization());
    $('#edit_short_term_memory_prompt').on('click', () => get_user_setting_text_input('short_template', 'Edit Short-Term Memory Prompt', 'The template for short-term memory injection. Use {{memories}} to insert the summaries.'));
    $('#edit_long_term_memory_prompt').on('click', () => get_user_setting_text_input('long_template', 'Edit Long-Term Memory Prompt', 'The template for long-term memory injection. Use {{memories}} to insert the summaries.'));
}

function populate_profile_select() {
    const $select = $('#profile');
    $select.empty();
    const profiles = get_settings('profiles');
    for (const profile_name in profiles) {
        $select.append(new Option(profile_name, profile_name));
    }
    $select.val(get_settings('profile'));
}

function update_token_displays() {
    $('#short_term_context_limit_display').text(get_short_token_limit());
    $('#long_term_context_limit_display').text(get_long_token_limit());
}

function update_profile_buttons() {
    const char_id = get_current_character_identifier();
    const chat_id = get_current_chat_identifier();
    const profile = get_settings('profile');

    if (get_settings('character_profiles')[char_id] === profile) {
        $('#character_profile').find('i').removeClass('fa-unlock').addClass('fa-lock');
    } else {
        $('#character_profile').find('i').removeClass('fa-lock').addClass('fa-unlock');
    }

    if (get_settings('chat_profiles')[chat_id] === profile) {
        $('#chat_profile').find('i').removeClass('fa-unlock').addClass('fa-lock');
    } else {
        $('#chat_profile').find('i').removeClass('fa-lock').addClass('fa-unlock');
    }
}

export function refresh_settings() {
    load_settings_ui();
}

export function initialize_popout() {
    // Popout settings window
    state.settings_element = $(`#${settings_div_id}`);
    state.original_settings_parent = state.settings_element.parent();
    $('#qvink_popout_button').on('click', function() {
        if (state.POPOUT_VISIBLE) {
            close_popout();
        } else {
            open_popout();
        }
    });
}

function open_popout() {
    state.popout = window.open("", "Qvink Memory Settings", "width=500,height=800,resizable=yes,scrollbars=yes");
    state.popout.document.head.innerHTML = document.head.innerHTML;
    state.popout.document.body.innerHTML = `<div id="${settings_div_id}"></div>`;
    state.popout.document.getElementById(settings_div_id).append(state.settings_element[0]);
    state.POPOUT_VISIBLE = true;
    dragElement(state.popout.document.getElementById(settings_div_id));
    state.popout.onbeforeunload = close_popout;
}

function close_popout() {
    if (state.popout) {
        state.original_settings_parent.append(state.settings_element[0]);
        state.popout.close();
        state.popout = null;
    }
    state.POPOUT_VISIBLE = false;
}

export function initialize_message_buttons() {
    // Add buttons to each message for summarization actions
    $(document).on('click', `.${summarize_button_class}`, function() {
        let mes = $(this).closest('.mes');
        let id = mes.attr('mesid');
        summarize_messages([id]);
    });
    $(document).on('click', `.${remember_button_class}`, function() {
        let mes = $(this).closest('.mes');
        let id = mes.attr('mesid');
        remember_message_toggle(id);
    });
    $(document).on('click', `.${forget_button_class}`, function() {
        let mes = $(this).closest('.mes');
        let id = mes.attr('mesid');
        forget_message_toggle(id);
    });
    $(document).on('click', `.${edit_button_class}`, function() {
        let mes = $(this).closest('.mes');
        let id = mes.attr('mesid');
        open_edit_memory_input(id);
    });
}

export function initialize_group_member_buttons() {
    // Add buttons to each group member for enabling/disabling summarization
    $(document).on('click', `.${group_member_enable_button}`, function() {
        let member_div = $(this).closest('.group_member_card');
        let character_key = member_div.attr('character_key');
        toggle_character_enabled(character_key);
        set_character_enabled_button_states();
    });
}

export function set_character_enabled_button_states() {
    // Update the visual state of the group member enable/disable buttons
    $('.group_member_card').each(function() {
        let member_div = $(this);
        let character_key = member_div.attr('character_key');
        let button = member_div.find(`.${group_member_enable_button}`);
        if (character_enabled(character_key)) {
            button.removeClass(group_member_enable_button_highlight);
        } else {
            button.addClass(group_member_enable_button_highlight);
        }
    });
}

export function initialize_slash_commands() {
    // Add slash commands for summarization
    let commands = [
        {
            name: "summarize",
            aliases: ["smem"],
            args: [],
            description: "Summarize the most recent message.",
            action: () => summarize_messages()
        },
        {
            name: "summarizechat",
            aliases: ["smemchat"],
            args: [],
            description: "Summarize all messages in the chat that don't have a summary.",
            action: () => auto_summarize_chat(false)
        },
        {
            name: "remember",
            aliases: ["rem"],
            args: [],
            description: "Toggle whether the most recent message is marked for long-term memory.",
            action: () => remember_message_toggle()
        },
        {
            name: "forget",
            aliases: ["for"],
            args: [],
            description: "Toggle whether the most recent message is excluded from memory.",
            action: () => forget_message_toggle()
        },
        {
            name: "clearmemory",
            aliases: ["clmem"],
            args: [],
            description: "Clear the memory of the most recent message.",
            action: () => clear_memory()
        },
        {
            name: "memoryon",
            aliases: [],
            args: [],
            description: "Enable memory for the current chat.",
            action: () => toggle_chat_enabled(true)
        },
        {
            name: "memoryoff",
            aliases: [],
            args: [],
            description: "Disable memory for the current chat.",
            action: () => toggle_chat_enabled(false)
        },
        {
            name: "memorytoggle",
            aliases: [],
            args: [],
            description: "Toggle memory for the current chat.",
            action: () => toggle_chat_enabled()
        }
    ];
    for (let command of commands) {
        getContext().slashCommandParser.addCommand(command);
    }
}

export function initialize_menu_buttons() {
    add_menu_button("Memory State", "fa-solid fa-brain", () => state.memoryEditInterface.open(), "Edit the memories in chat.");
    add_menu_button("Memory Preview", "fa-solid fa-book-open", () => display_injection_preview(), "Preview the current memory state.");
}

// UI functions
export function get_message_div(index) {
    // given a message index, get the div element for that message
    // it will have an attribute "mesid" that is the message index
    let div = $(`div[mesid="${index}"]`);
    if (div.length === 0) {
        return null;
    }
    return div;
}
export function get_summary_style_class(message) {
    let include = get_data(message, 'include');
    let remember = get_data(message, 'remember');
    let exclude = get_data(message, 'exclude');  // force-excluded by user
    let lagging = get_data(message, 'lagging');  // not injected yet

    let style = ""
    if (remember && include) {  // marked to be remembered and included in memory anywhere
        style = css_long_memory
    } else if (include === "short") {  // not marked to remember, but included in short-term memory
        style = css_short_memory
    } else if (remember) {  // marked to be remembered but not included in memory
        style = css_remember_memory
    } else if (exclude) {  // marked as force-excluded
        style = css_exclude_memory
    }

    if (lagging) {
        style = `${style} ${css_lagging_memory}`
    }

    return style
}
export function update_message_visuals(i, style=true, text=null) {
    // Update the message visuals according to its current memory status
    // Each message div will have a div added to it with the memory for that message.
    // Even if there is no memory, I add the div because otherwise the spacing changes when the memory is added later.

    // div not found (message may not be loaded)
    let div_element = get_message_div(i);
    if (!div_element) {
        return;
    }

    // remove any existing added divs
    div_element.find(`div.${summary_div_class}`).remove();

    // If setting isn't enabled, don't display memories
    if (!get_settings('display_memories') || !chat_enabled()) {
        return;
    }

    let chat = getContext().chat;
    let message = chat[i];
    let reasoning = get_data(message, 'reasoning')
    let memory = get_memory(message)
    let lagging = get_data(message, 'lagging')  // lagging behind injection threshold
    let error_message = get_data(message, 'error');
    if (error_message) error_message = translate(error_message)
    let exclude_messages = get_settings('exclude_messages_after_threshold')  // are we excluding messages after the threshold?

    // get the div holding the main message text
    let message_element = div_element.find('div.mes_text');

    // If we are excluding messages and the message isn't lagging (i.e. the message is removed and the summary injected)
    if (exclude_messages && !lagging) {
        message_element.addClass(css_removed_message);
    } else {
        message_element.removeClass(css_removed_message);
    }

    // get the style class, either passed in or based on inclusion flags
    let style_class = style ? get_summary_style_class(message) : ""

    // if no text is provided, use the memory text
    if (!text) {
        text = ""  // default text when no memory
        if (memory) {
            text = clean_string_for_html(`Memory: ${memory}`)
        } else if (error_message) {
            style_class = ''  // clear the style class if there's an error
            text = `Error: ${error_message}`
        }
    }

    // parse markdown
    // text, ch_name, isSystem, isUser, messageId
    text = messageFormatting(text, null, false, false, -1)

    // create the div element for the memory and add it to the message div
    let memory_div = $(`<div class="${summary_div_class} ${css_message_div}"><span class="${style_class}">${text}</span></div>`)
    if (reasoning) {
        reasoning = clean_string_for_html(reasoning)
        memory_div.prepend($(`<span class="${summary_reasoning_class}" title="${reasoning}">[${t`Reasoning`}] </span>`))
    }
    message_element.after(memory_div);

    // add a click event to the memory div to edit the memory
    memory_div.on('click', function () {
        open_edit_memory_input(i);
    })
}
export function update_all_message_visuals() {
    // update the message visuals of each visible message, styled according to the inclusion criteria
    let chat = getContext().chat
    let first_displayed_message_id = Number($('#chat').children('.mes').first().attr('mesid'))
    for (let i=chat.length-1; i >= first_displayed_message_id; i--) {
        update_message_visuals(i, true);
    }
}
export function open_edit_memory_input(index) {
    // Allow the user to edit a message summary
    let message = getContext().chat[index];
    let memory = get_memory(message)
    memory = memory?.trim() ?? '';  // get the current memory text

    let $message_div = get_message_div(index);  // top level div for this message
    let $message_text_div = $message_div.find('.mes_text')  // holds message text
    let $memory_div = $message_div.find(`div.${summary_div_class}`);  // div holding the memory text

    // Hide the memory div and add the textarea after the main message text
    let $textarea = $(`<textarea class="${css_message_div} ${css_edit_textarea}" rows="1"></textarea>`);
    $memory_div.hide();
    $message_text_div.after($textarea);
    $textarea.focus();  // focus on the textarea
    $textarea.val(memory);  // set the textarea value to the memory text (this is done after focus to keep the cursor at the end)
    $textarea.height($textarea[0].scrollHeight-10);  // set the height of the textarea to fit the text

    function confirm_edit() {
        let new_memory = $textarea.val();
        if (new_memory === memory) {  // no change
            cancel_edit()
            return;
        }
        edit_memory(message, new_memory)
        $textarea.remove();  // remove the textarea
        $memory_div.show();  // show the memory div
        refresh_memory();
    }

    function cancel_edit() {
        $textarea.remove();  // remove the textarea
        $memory_div.show();  // show the memory div
    }

    // save when the textarea loses focus, or when enter is pressed
    $textarea.on('blur', confirm_edit);
    $textarea.on('keydown', function (event) {
        if (event.key === 'Enter') {  // confirm edit
            event.preventDefault();
            confirm_edit();
        } else if (event.key === 'Escape') {  // cancel edit
            event.preventDefault();
            cancel_edit();
        }
    })
}
export function display_injection_preview() {
    let text = refresh_memory()
    text = `...\n\n${text}\n\n...`
    display_text_modal("Memory State Preview", text);
}

export async function display_text_modal(title, text="") {
    // Display a modal with the given title and text
    // replace newlines in text with <br> for HTML
    let ctx = getContext();
    text = text.replace(/\n/g, '<br>');
    let html = `<h3>${title}</h3><div style="text-align: left; overflow: auto;">${text}</div>`
    let popup = new ctx.Popup(html, ctx.POPUP_TYPE.TEXT, undefined, {okButton: 'Close', allowVerticalScrolling: true, wider: true});
    await popup.show()
}
export async function get_user_setting_text_input(key, title, description="") {
    // Display a modal with a text area input, populated with a given setting value
    let value = get_settings(key) ?? '';

    title = `
<h3>${title}</h3>
<p>${description}</p>
`

    let restore_button = {  // don't specify "result" key do not close the popup
        text: 'Restore Default',
        appendAtEnd: true,
        action: () => { // fill the input with the default value
            popup.mainInput.value = default_settings[key] ?? '';
        }
    }
    let ctx = getContext();
    let popup = new ctx.Popup(title, ctx.POPUP_TYPE.INPUT, value, {rows: 20, customButtons: [restore_button], wider: true});

    add_i18n($(popup.content))  // translate any content

    // Now remove the ".result-control" class to prevent it from submitting when you hit enter.
    popup.mainInput.classList.remove('result-control');

    let input = await popup.show();
    if (input) {
        set_settings(key, input);
        refresh_settings()
        refresh_memory()
    }
}
export function progress_bar(id, progress, total, title) {
    // Display, update, or remove a progress bar
    id = `${PROGRESS_BAR_ID}_${id}`
    let $existing = $(`.${id}`);
    if ($existing.length > 0) {  // update the progress bar
        if (title) $existing.find('div.title').text(title);
        if (progress) {
            $existing.find('span.progress').text(progress)
            $existing.find('progress').val(progress)
        }
        if (total) {
            $existing.find('span.total').text(total)
            $existing.find('progress').attr('max', total)
        }
        return;
    }

    // create the progress bar
    let bar = $(`
<div class="${id} qvink_progress_bar flex-container justifyspacebetween alignitemscenter">
    <div class="title">${title}</div>
    <div>(<span class="progress">${progress}</span> / <span class="total">${total}</span>)</div>
    <progress value="${progress}" max="${total}" class="flex1"></progress>
    <button class="menu_button fa-solid fa-stop" title="${t`Abort summarization`}"></button>
</div>`)

    // add a click event to abort the summarization
    bar.find('button').on('click', function () {
        stop_summarization();
    })

    // append to the main chat area (#sheld)
    $('#sheld').append(bar);

    // append to the edit interface if it's open
    if (state.memoryEditInterface?.is_open()) {
        state.memoryEditInterface.$progress_bar.append(bar)
    }
}
export function remove_progress_bar(id) {
    id = `${PROGRESS_BAR_ID}_${id}`
    let $existing = $(`.${id}`);
    if ($existing.length > 0) {  // found
        debug("Removing progress bar")
        $existing.remove();
    }
}

export function add_i18n($element=null) {
    // dynamically translate config settings
    log("Translating with i18n...")
    if ($element === null) {
        $element = $(`.${settings_content_class}`)
    }

    $element.each(function () {
        let $this = $(this);
        // Find all elements with either text or a title
        $this.find('*').each(function () {
            let $el = $(this);

            // translate title attribute if present
            if ($el.attr('title')) {
                $el.attr('title', translate($el.attr('title')));
            }

            if ($el.attr('placeholder')) {
                $el.attr('placeholder', translate($el.attr('placeholder')));
            }

            // translate the inner text, if present
            if (!this.childNodes) return
            for (let child of this.childNodes) {  // each child node (including text nodes)
                let text = child.nodeValue
                if (!text?.trim()) continue  // null or just whitespace
                child.nodeValue = text?.replace(text?.trim(), translate(text?.trim()))  // replace text with translated text
            }
        });
    })
}

export function add_menu_button(text, fa_icon, callback, hover=null) {
    let $button = $(`
    <div class="list-group-item flex-container flexGap5 interactable" title="${hover ?? text}" tabindex="0">
        <i class="${fa_icon}"></i>
        <span>${text}</span>
    </div>
    `)

    let $extensions_menu = $('#extensionsMenu');
    if (!$extensions_menu.length) {
        error('Could not find the extensions menu');
    }

    $button.appendTo($extensions_menu)
    $button.click(() => callback());
}

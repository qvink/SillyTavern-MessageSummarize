import { getContext, extension_settings } from '../../../../extensions.js';
import { dragElement } from '../../../../RossAscends-mods.js';
import { settings_div_id, settings_content_class, MODULE_NAME, long_memory_macro, short_memory_macro, generic_memories_macro, remember_button_class, forget_button_class, summarize_button_class, edit_button_class, css_message_div, css_long_memory, css_short_memory, css_remember_memory, css_exclude_memory, css_lagging_memory, css_removed_message, summary_div_class, summary_reasoning_class, css_edit_textarea, PROGRESS_BAR_ID, group_member_enable_button, group_member_enable_button_highlight } from './constants.js';
import { global_settings, settings_ui_map, default_settings, state } from './state.js';
import { get_settings, set_settings, get_short_token_limit, get_long_token_limit, chat_enabled, toggle_chat_enabled, character_enabled, toggle_character_enabled } from './settings.js';
import { log, toast, get_current_character_identifier, get_current_chat_identifier, assign_and_prune, check_objects_different, assign_defaults, clean_string_for_html, escape_string, unescape_string, regex } from './utils.js';
import { saveSettingsDebounced } from '../../../../../script.js';
import { download, parseJsonFile, copyText, stringToRange } from '../../../../utils.js';
import { t, translate } from '../../../../i18n.js';
import { get_current_preset, get_presets, check_preset_valid, get_connection_profiles, check_connection_profile_valid, get_summary_preset_max_tokens, get_connection_profile_api, get_summary_connection_profile } from './api.js';
import { get_data, get_memory, edit_memory, remember_message_toggle, forget_message_toggle, clear_memory, check_message_exclusion, concatenate_summaries, get_long_memory, get_short_memory } from './main.js';
import { getRegexScripts, runRegexScript } from '../../../../../scripts/extensions/regex/index.js';
import { createRawPrompt, messageFormatting, scrollChatToBottom } from '../../../../../script.js';

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

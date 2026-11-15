# Translate with AI

A Chrome extension for translating text with your ChatGPT subscription or with PLaMo 3 Translate running locally in LM Studio.

## Installation

1. Download `translate-with-ai-v*.zip` from the **Assets** section of a [GitHub release](https://github.com/arenahito/chrome-translate-with-ai/releases) and extract it to a local folder.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Open the extension from the Chrome toolbar.

Keep the extracted folder in place. For updates, extract the new release into the same folder and reload the extension on `chrome://extensions`.

For ChatGPT translation, click the login button, sign in to ChatGPT, and authorize access to your ChatGPT plan.

For local translation, make PLaMo 3 Translate available on your server and select **LM Studio**, **Ollama**, or **Custom** under **Translation engine**. The default ports are 1234, 11434, and 8317, respectively. Edit **Connection URL** to use a different loopback address or port. LM Studio and Ollama have a **Reset** button for restoring their default URLs. Custom uses an OpenAI-compatible API that serves PLaMo 3 Translate. Local connections require no API token.

## Translation

1. Enter or paste text into the left pane. ChatGPT accepts up to **50,000 characters**. LM Studio also applies a smaller context budget based on the loaded model and room for the translation. Split long texts if they exceed that budget.
2. Leave the source language on automatic detection, or select a language.
3. Select the target language. Japanese offers polite and plain styles.
4. Click the translate button, or press **Ctrl+Enter** (**Cmd+Enter** on macOS).
5. Read the translation in the right pane, or use the copy button.

Typing does not start a translation. Use the stop button to cancel a translation in progress.

The swap button exchanges the source and target languages while keeping both texts. Swapping is unavailable when the source language is set to automatic detection.

## Settings

Open the gear menu to change:

- **Model:** Terra is selected by default. Available models depend on your ChatGPT account.
- **Reasoning level:** Low by default. Available levels depend on the selected model.
- **Fast mode:** Off by default. With the ChatGPT engine, turning it on requests priority processing for new translations.
- **Appearance:** Light, dark, or system. The default follows your system appearance.
- **Display language:** English or Japanese. On first use, Japanese is selected if your browser language is Japanese; otherwise, English is selected. Your choice is saved.

Your selections are saved for the next session. Changing the source text, languages, model, or reasoning level requires a new translation; an existing result is marked as outdated.

## Sign-in and data

Sign-in information is encrypted and saved locally in your Chrome profile, so you can stay signed in after restarting Chrome. Use the logout button in the gear menu to sign out. If access expires or is revoked, sign in again.

ChatGPT sends the source text to OpenAI and uses your ChatGPT allowance. Local engines send it to the configured loopback server and do not fall back to ChatGPT if the server is unavailable. The extension does not save source text or translations as history.

Uninstalling the extension removes its locally stored data.

Translate with AI is an independent project, not an official OpenAI product.

# Paranoid Chat Frontend

Paranoid Chat is a private, invite-based real-time chat client for small groups. It provides account authentication, password-protected rooms, optional join tokens, ephemeral rooms, message history, replies, mentions, typing indicators, local themes, and room management.

**Live application:** <https://paranoid-chats.pages.dev>
**Public frontend repository:** <https://github.com/Haruki9767/chat-frontend>

> This project is intended for trusted groups rather than public discovery. There is no public room directory. Users need an authenticated account and the room code plus the required password or invitation token to join a room.

## Current capabilities

| Area | Current behavior |
|---|---|
| Consent | A consent screen is shown before the application starts. The accepted consent version is stored in browser `localStorage`. |
| Accounts | Users can log in or sign up with a username and password. New accounts require the shared application password and hCaptcha verification. |
| Passwords | Passwords are not recoverable through the client. Users should store them safely. |
| Sessions | The session token is stored locally so the client can attempt to restore a login after a page reload. |
| Room access | Users join with a 32-character room code, a room password when required, or an optional join token. |
| Password rooms | Owners can create rooms protected by a room password. Owners can change the password and manage join tokens. |
| Ephemeral rooms | Owners can create rooms that expire after 24 hours. These rooms do not expose the normal persistent room-management controls. |
| Join tokens | Room owners can mint, list, and revoke invitation tokens. A valid token can be used instead of the room password where supported. |
| Messaging | Connected users can exchange real-time messages and view available room history. |
| Conversation tools | Users can reply to messages, copy message text, mention participants, use basic Markdown-style formatting, open links safely, and view typing indicators. |
| Personalization | The Settings panel provides selectable themes, fonts, and a typing-indicator preference. |
| Account controls | Users can log out or request account deletion from the room screen. |
| E2EE | End-to-end encrypted rooms are not available in the current build. The creation control is disabled, and sending in an E2EE room is blocked because client-side encryption and decryption are not implemented yet. |

## Using the application

### 1. Accept the consent screen

Review the displayed consent information, select the acknowledgement checkbox, and continue. The application will not initialize until the current consent version is accepted.

### 2. Log in or create an account

For an existing account, enter the username and password and complete hCaptcha verification. To create an account, switch to **Sign Up**, provide a username and password, enter the shared application password, and complete hCaptcha verification.

Usernames and passwords are validated by the application service. There is no password-reset flow in the current client, so users must retain their credentials securely.

### 3. Join an existing room

Choose **Join**, then provide the complete room code. Enter the room password when the room requires one. If the room owner invited you with a join token, you may enter that token instead where supported. Select **Join Room**.

Knowing a room code alone is not sufficient for password-protected rooms. Room codes should still be shared only with intended participants.

### 4. Create a room

Choose **Create**, select either **Password Room** or **Ephemeral (24h)**, enter a room name, and provide the required values. Room names are display labels and do not uniquely identify a room; the generated room code is the actual join identifier.

The **E2EE (in development)** option is intentionally disabled. Do not treat the current E2EE protocol messages as a usable encrypted-chat feature.

### 5. Chat and manage the room

Inside a room, send messages from the composer. Select a message to prepare a reply. Type `@` to find participant mentions. The client displays connection state, participant count, typing indicators, message timestamps, and time dividers.

The room owner can open **Manage** for eligible rooms to copy the room code, change the room password, and mint or revoke join tokens. Changing a room password disconnects other connected participants; they must rejoin with the new password.

Select **Leave** to close the current connection and return to the room screen. Use **Log out** to end the authenticated session.

## Deployment and configuration

This repository contains the public static frontend. Its deployment environment must provide the application service URL through the platform configuration used by `functions/config.js`. Keep deployment credentials, service URLs, and private service implementation details outside this public repository.

The client also contains the hCaptcha site key and verification endpoint in `script.js`. Production deployments should configure these values for the intended hCaptcha site and verification service.

## Local development

This repository is a static frontend. It does not contain a package manifest or a local development server configuration. For a quick syntax check, run:

```bash
node --check script.js
```

For local preview, serve the repository directory with any static HTTP server. A working application service and the required platform configuration are needed for authentication, room access, and real-time messaging.

## Security and privacy notes

The application is designed for trusted groups and does not provide public room discovery. Use only deployments and services that you trust. The client sends authentication and room requests to the configured application service, so that service controls how those requests are handled.

The current client stores the session token, theme, font, and typing-indicator preference in browser `localStorage`. Do not use the application on a shared browser profile, and clear site storage when leaving a device you do not control.

The frontend escapes message content before rendering it and opens detected links in a new tab with `noopener`, `noreferrer`, and `nofollow`. These client-side protections do not replace secure authentication, authorization, rate limiting, input validation, and transport security.

E2EE is not currently available. Messages in the supported room modes must not be described as end-to-end encrypted.

## Repository structure

| Path | Purpose |
|---|---|
| `index.html` | Application layout, consent screen, authentication controls, room controls, chat view, settings, and management dialogs. |
| `script.js` | Client state, authentication requests, real-time connection lifecycle, room actions, message rendering, settings, and service integration. |
| `style.css` | Visual theme, layout, responsive behavior, and component styling. |
| `functions/config.js` | Deployment configuration bridge that exposes the configured service URL to the browser. |
| `_headers` | Static hosting security and response headers. |

## Important limitations

The current frontend does not implement password recovery, public room discovery, client-side E2EE, or offline message delivery. A room connection depends on the configured application service and an active network connection.

## References

[1]: https://paranoid-chats.pages.dev "Paranoid Chat live application"
[2]: https://github.com/Haruki9767/chat-frontend "Paranoid Chat frontend repository"
[3]: https://www.hcaptcha.com/ "hCaptcha"

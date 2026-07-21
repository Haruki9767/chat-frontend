# Paranoid Chat

A small, private, real-time chat app built for a closed group of friends — not a public product. There's no public room list and no way to stumble into a conversation that isn't yours.

**Live:** https://paranoid-chats.pages.dev

---

## What it does

- **Real accounts, not links.** Sign up with a username and password. No email required — and no way to recover a lost password, on purpose. Every name shown in chat carries a short tag (`username#a1b2`) that can't be faked, so no one can impersonate anyone else.
- **Two passwords stand between you and a conversation.** A shared app password gets you in the door at all; each room can also have its own password on top of that.
- **Rooms are numbered, not guessable.** Creating a room gives it a unique number (like `#1254`). That number — not the room's name — is what actually lets someone join. Two rooms can share the same name and still be completely separate spaces.
- **Reply to any message.** Tap a message to quote it in your reply, so context never gets lost in a busy conversation.
- **Everyone gets their own color.** Consistent across every session, so it's always obvious who's talking.
- **Messages don't stick around forever.** Chat history clears itself out automatically after a day.

---

## Using the app

1. **Enter the app password.** This is shared with you by whoever invited you.
2. **Log in or sign up.** Pick a username and password — write the password down somewhere, because there's no way to reset it.
3. **Join a room** by entering its number and password (if it has one), or **create a room** and set your own password,and name.
4. **Leave anytime** — rejoin later with the same room number and password.

---

## Design notes

Plain HTML/CSS/JS, no framework, kept deliberately minimal and fast on mobile. No ads, no tracking, no analytics. The whole point is a quiet, private space for a small group of people who already know each other.

---
title: Set up Planner
summary: Switch it on, set up the board's columns, and choose where meeting overviews go.
order: 0
pages: /admin
access: mentor
---

## Checklist

- [ ] An admin switches Planner on for the team on Manage Apps, in Portal
- [ ] On Planner's [Admin](team:planner/admin) page, set up the columns between Not Started and Done
- [ ] Your team's Slack or Discord is connected (Integrations, in Portal)
- [ ] On Planner's [Admin](team:planner/admin) page, choose the channel for meeting overviews and choose **Save**
- [ ] Optionally, add trusted students on the Admin page

## Columns

Every board starts with **Not Started** and ends with **Done**; those two always stay. The columns between them are your team's own, in the **Columns** section of the Admin page. A team starts with one, In Progress.

- **Add a column**: type its name under the list and choose **Add column**. It goes just before Done.
- **Move a column**: the up and down arrows beside it.
- **Rename a column**: the pencil beside it.
- **Delete a column**: the trash can beside it. Its cards go to the bottom of Not Started; no card is deleted.

## Meeting overviews

Mentors and admins send a meeting overview from the board. It's posted to the channel you choose here, headed with the day it was sent, with two lists, Not Started and Started (everything in between), and it updates as the team works: finished cards are crossed off, and new ones are added. Only the latest overview keeps updating.

The bot must be able to post in the channel. In Slack, add the bot to a private channel first; in Discord, allow its role in one. The channel picker says when it can't.

## Adding cards from chat

Members can add a card to Not Started from any channel by typing `/gb-add` and the card, for example `/gb-add Order more bolts`. Only they see the reply. Their Slack or Discord account has to be linked to their Gearbox account, which it is if they sign in with it.

## Trusted students

Mentors and admins can put anyone on a card or take them off. To let a student do it too, pick them under **Add a student** in the **Trusted students** section of the Admin page and choose **Add**. **Remove** beside a name takes it away.

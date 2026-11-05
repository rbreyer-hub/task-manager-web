# Task Board

A monday.com-style task manager: projects, tasks, statuses, priorities, due dates and reminders.
Vanilla JS, no build step. Data syncs through Firebase (Google sign-in + Firestore).

- **Views:** Today, Upcoming, Overdue, All tasks, Completed, and one view per project
- **Layouts:** Table (color-coded groups, click-to-change status/priority pills, inline due dates) and Kanban (drag cards between statuses)
- **Editing:** click a task to open the side panel; edit or delete projects with the pencil next to the project title
- **Reminders:** browser notifications (click the bell in the top bar to allow them) plus an in-app toast. They fire while the app is open in any tab; reminders missed while it was closed fire the next time you open it.
- **Shortcut:** press `N` for a new task

Firestore layout: `users/{uid}/projects/{id}` and `users/{uid}/tasks/{id}`, covered by the
`users/{userId}/{document=**}` rule in the shared `budget-planner-fb` project.

When editing `app.js` or `styles.css`, bump the `?v=` query string in `index.html` so browsers pick up the change.

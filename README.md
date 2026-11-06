# Task Board

A monday.com-style task manager: projects, tasks, statuses, priorities, due dates and reminders.
Vanilla JS, no build step. Data syncs through Firebase (Google sign-in + Firestore).

- **Views:** Today, Upcoming, Overdue, All tasks, Completed, and one view per project
- **Layouts:** Table (color-coded groups, click-to-change status/priority pills, inline due dates), Kanban (drag cards between statuses) and Calendar (click a day to list what's due). Each project remembers its own layout.
- **Statuses:** Not started, Working on it, Stuck, Done
- **Priorities:** Low, Medium, High, Critical (red, with a "!" mark)
- **Subtasks:** checklist items under each task. Check off, rename (click the text) or remove them right in the table, or in the task panel.
- **Categories:** optional sections inside a project (e.g. Kitchen, Garden). Each gets its own group in the table; add them below the groups or in Edit project, pick one in the task panel, or drag a task between groups. The ⋯ on a category renames, recolors, reorders or deletes it (its tasks move to Uncategorized). Stored as `categories: [{id,name,color}]` on the project and `categoryId` on the task.
- **Editing:** click a task to open the side panel; edit or delete projects with the pencil next to the project title
- **Reminders:** browser notifications (click the bell in the top bar to allow them) plus an in-app toast. They fire while the app is open in any tab; reminders missed while it was closed fire the next time you open it.
- **Hide completed:** toolbar switch hides finished tasks in Table, Kanban and Calendar (remembered per browser; the Completed view ignores it).
- **Reorder:** drag the ⋮⋮ handle on a table row (mouse or touch), or focus it and use the arrow keys. Works in project views and All tasks; in All tasks, dropping into another project's group moves the task there. Today/Upcoming/Overdue stay sorted by due date.
- **Shortcut:** press `N` for a new task

Firestore layout: `users/{uid}/projects/{id}` and `users/{uid}/tasks/{id}`, covered by the
`users/{userId}/{document=**}` rule in the shared `budget-planner-fb` project.

When editing `app.js` or `styles.css`, bump the `?v=` query string in `index.html` so browsers pick up the change.

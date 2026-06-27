This is how to open with automatic project saving:

1. Start the local server from this folder:

```bash
node server.js
```

Keep that terminal open. If the server stops, the `http://127.0.0.1:8000/...` pages will not load.

2. Open:

```text
http://127.0.0.1:8000/main-dashboard.html
```

Hexapod projects page:

```text
http://127.0.0.1:8000/hexapod-projects.html
```

Direct file mode still opens immediately, but it cannot auto-save to `project/hexapods.json`:

```text
file:///home/kemo/my_work/Robots%20control/main-dashboard.html
```

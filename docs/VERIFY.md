# Manual smoke test

Run before calling a phase done (and after any canvas/store change). `npm run dev`, then:

1. **Fresh start:** click **New**. You get an empty ATAK pane that says "Empty: drag components here".
2. **Add by click:** click *Heading*, then *Button* in the palette. Both appear, and the Button is selected (blue outline + label tag).
3. **Add by drag:** drag *Status badge* above the Heading. A blue insertion bar shows where it will land.
4. **Move:** drag the Button above the Heading. Then try dragging a Section into itself: it must refuse.
5. **Wire data:** select the badge → Connected data → *+ New data field…*. The badge now shows "Option 1".
   Open the **Data** tab, rename the field's key, and the badge stays connected.
6. **Wire an action:** select the Button → When click → *+ New action…*. Problems shows "needs a description".
   Type a description and the error clears.
7. **Undo/redo:** Ctrl+Z steps back one edit (one step per typing burst, not per keystroke), Ctrl+Y re-applies.
8. **Persist:** reload the page. The project is still there (browser autosave).
9. **Save/Open:** **Save file** downloads `<name>.takui.json`. **New**, then **Open…** that file, and the project comes back identical.
10. **Sample:** Samples → *Event CAD*. Tabs switch, the incident list shows 3 rows with different priority colors,
    the dialog screen renders as a pop-up, and Problems says "No problems".
11. **Frames:** switch Tablet half → full → Phone. The pane resizes and nothing overflows sideways.
   **Screen size:** pick Big phone → Small phone, then a desktop platform at Big screen computer → Small laptop, then Custom size… and type 900 × 600. The device and panel resize, the note under the canvas shows the px size, and the choice survives a reload.
12. **Platforms:** open the Incident Report template and switch ATAK → WinTAK → CloudTAK. Each has its own look and frame.
13. **Spelling:** change a button's text to "Sned". It shows in the inspector and bottom bar. Click the word, then "send". Fixed.
14. **Renames carry through:** in Status Board, rename the list item field `team › status` to `state`. The badge in the row stays connected, with no errors.
15. **Tour:** click **Tour** and complete all 14 steps. Each one advances by itself.
16. **Export:** open Event CAD → **Export for agent…**. The checks are green and the preview shows HANDOFF.md. **Download handoff** gives a zip with HANDOFF.md, ui-spec.json, PROMPT.md and 10 PNGs (one per tab per platform).
17. **Export blocked:** clear an action's description. Export shows the error, and Download/Copy are disabled.
18. **Copy prompt:** paste into a text editor. It holds the instructions, HANDOFF.md and the JSON spec.
19. **Code tab:** open Event CAD → **Code**. Switch ATAK / CloudTAK and open a file. Rename a button in the designer; its text changes in the generated strings/panel.
20. **Scaffold in the zip:** export with "Include generated code" ticked. The zip has `scaffold/atak/…` and `scaffold/cloudtak/…`, each with a SCAFFOLD.md.
21. **Describe a screen:** **✨ Describe…** → pick an example → enter your API key → **Draft it**. The preview lists components, new fields and actions, plus notes. **Insert as a new screen**: Problems shows no errors, and Ctrl+Z removes it in one step.
22. **Bad key:** enter `sk-ant-nope` and draft. You get "That API key was rejected" (and no crash). **Forget key** clears it.
23. **Launch icon:** deselect everything → **Launch icon & colors** → **Upload picture…** (or drop a PNG/JPG/SVG on the tile). The icon shows at toolbar sizes and in the preview's toolbar (on the map for ATAK/CloudTAK, in the ribbon for WinTAK/TAKX/WebTAK). Export: the zip has `assets/icon.png` and HANDOFF.md has a "Look and feel" section.
24. **Custom colors:** click a preset (or "From icon"). Headings, the selected tab, underlines and primary buttons recolor on every platform preview and in the mockups. Type `#333333` as Highlight: the panel and Problems both warn it's hard to see. ↺ resets one color; **Use platform colors** resets all; Ctrl+Z undoes each step.
25. **Home banner:** deselect → **Home banner** → tick "Show a banner…". The launch screen gets a strip with the plugin name under its title bar; other screens don't (unless "Show on: Every screen"; dialogs never). Try each layout (Logo left / right / Both sides / Text only), set a side to "Its own picture…" and upload a wide logo (it keeps its shape), add a second line, center the text, change the background. Export: HANDOFF.md describes the banner and the zip has `assets/banner-<side>.png` for own-picture logos.

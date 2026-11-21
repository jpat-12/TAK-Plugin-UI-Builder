# Walkthrough: build your first plugin screen

This is the written version of the in-app **Tour** (top bar → Tour). In about two minutes you
build a small "Shift Check-In" plugin: a question, two answers, and a button that sends the
answer. You don't write any code.

Start it with `npm run dev` and open the page. The tour offers itself on your first visit. Each
step plays a short **Show me** animation: a ghost cursor does the action on the real screen.
You can act at any time, even mid-animation, and **▶ Show me** replays it.

---

**1. Name your plugin.** With nothing selected, the right-hand panel shows **Plugin**. Change
**Name** to `Shift Check-In`. The pane title and launch button follow along.

**2. Drag a Heading onto the pane.** In the left palette under *Text*, drag **Heading** onto
the dark pane. A blue bar shows where it will land. (Clicking a palette item also works,
including on touch screens.)

**3. Change its text.** The new heading is selected (blue outline). On the right under
**Settings**, set **Text** to `How's your shift?`

**4. Drag Radio buttons below it.** Under *Inputs*, drag **Radio buttons** onto the pane. If
you drop it on the heading, it goes right after the heading.

**5. Connect it to data.** With the radio buttons selected, open **Connected data** and choose
**+ New data field…**. The plugin now has a field that remembers the answer, and the coding
agent will know about it.

**6. Name the choices.** Open the **Data** tab (left). In your new field, change `Option 1` to
`Fit for duty` and `Option 2` to `Need relief`. Click a color square to give each one a color.
Badges and lists use these colors.

**7. Drag a Button below the radio buttons.** Go back to the **Add** tab and drag a **Button**
onto the pane.

**8. Label it.** Set its **Text** to `Send check-in`.

**9. Make it do something.** Under **When… click**, choose **+ New action…**.

**10. Describe it in plain words.** In **What should it do?** write
`Send my answer to the team lead as a CoT and show "Sent"`. This sentence is what the coding
agent builds from, so be specific about who gets what and what the user sees.

**11. Reorder without dragging.** With the button selected, press **Alt+↑** (or **↑ Up** under
*Move* on the right) to put it above the radio buttons. **Alt+→** moves a component into the
block above it, and **Alt+←** moves it back out.

**12. Check for problems.** The bottom bar should say **✓ No problems**. If anything is wrong
(say a button with no action description, or a typo), it's listed there in plain words. Click
an item to jump to it. Click a misspelled word to see suggestions.

**13. See it on another platform.** Click empty canvas space, tick **CloudTAK** under
*Platforms*, then click **CloudTAK** in the preview switch above the canvas. Same design, CloudTAK's
look. Try WinTAK and WebTAK too.

**14. Save it.** Click **Save file**. You get `shift-check-in.takui.json`, which is your design.
Keep it so you can reopen and change things.

**15. Hand it off.** Click **Export for agent…** (top right):
- Check the *Ready?* list. Errors block export; typos are worth fixing because they ship.
- Optionally add notes for the agent ("Target ATAK 5.6", "ask before adding network calls")
  and a starter repo per platform.
- **Download handoff (.zip)**, unzip it, open the folder in Claude Code and paste the text of
  `PROMPT.md`. Or click **Copy prompt for Claude Code** and paste it into an empty folder's session.

---

## Next things to try

- **New… → Team Status Board** (or any template) to start further along.
- **Tabs:** drag **Tabs** onto a screen, then click **＋** in the tab bar to add tabs.
- **Repeating list:** drag a **Repeating list** in and connect it to a *List of records*
  field. Design one row, and the preview shows three.
- **Show only when…:** select a component and add a condition, e.g. show the "Request
  check-in" button only when *I am the team lead* is on.
- **Dialogs and settings:** use **+ Dialog** and **+ Settings** above the canvas to add pop-ups
  and a settings page.

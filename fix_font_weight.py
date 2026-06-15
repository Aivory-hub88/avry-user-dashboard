import re

file_path = "/Users/ireichmann/Documents/Aivory V2/frontend/avry-user-dashboard/lib/pdfExport.ts"

with open(file_path, "r") as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    # Check if this line sets font to normal
    if "pdf.setFont(F(), 'normal')" in line or "pdf.setFont(FB(), 'normal')" in line:
        # Check surrounding lines (above) to see if it's a LABEL or UNIT
        is_faint_label = False
        # Look back up to 3 lines
        for j in range(max(0, i - 3), i):
            if "LABEL_A" in lines[j] or "UNIT_C" in lines[j] or "TRACK" in lines[j] or "uppercase" in lines[j].lower():
                is_faint_label = True
        
        if is_faint_label:
            # Change normal to bold for these labels
            line = line.replace("'normal'", "'bold'").replace("F()", "FB()")
            
    new_lines.append(line)

with open(file_path, "w") as f:
    f.writelines(new_lines)

print("Replaced faint labels with bold weight.")

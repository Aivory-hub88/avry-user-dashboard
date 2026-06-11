import os
import re

directory = '/Users/ireichmann/Documents/Aivory V2/frontend/avry-user-dashboard'
pattern = re.compile(re.escape('#b2cca2'), re.IGNORECASE)

count_files = 0
count_replacements = 0

for root, _, files in os.walk(directory):
    if 'node_modules' in root or '.next' in root or '.git' in root:
        continue
    for file in files:
        if file.endswith(('.tsx', '.ts', '.css')):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content, num_subs = pattern.subn('#b7cba6', content)
            
            if num_subs > 0:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                count_files += 1
                count_replacements += num_subs

print(f"Replaced {count_replacements} occurrences in {count_files} files.")

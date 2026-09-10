import re

def to_camel(snake_str):
    if '_' not in snake_str:
        return snake_str
    components = snake_str.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

with open('prisma/schema.prisma', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if '@relation' in line and 'fields: [' in line:
        # Match fields: [org_id, team_id]
        match = re.search(r'fields:\s*\[(.*?)\]', line)
        if match:
            fields = [f.strip() for f in match.group(1).split(',')]
            camel_fields = [to_camel(f) for f in fields]
            new_array = 'fields: [' + ', '.join(camel_fields) + ']'
            new_line = line[:match.start()] + new_array + line[match.end():]
            new_lines.append(new_line)
        else:
            new_lines.append(line)
    else:
        new_lines.append(line)

with open('prisma/schema.prisma', 'w') as f:
    f.writelines(new_lines)

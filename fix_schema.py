import re

with open('prisma/schema.prisma', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    # Match a field definition: 2 spaces, field name, spaces, type, optional modifiers
    # e.g., "  team_id                      String?"
    # We want to match fields that have underscores
    match = re.match(r'^  ([a-z0-9_]+)(\s+)(.*)$', line)
    if match:
        field_name = match.group(1)
        spaces = match.group(2)
        rest = match.group(3)
        
        if '_' in field_name:
            # Convert field_name to camelCase
            parts = field_name.split('_')
            camel_case = parts[0] + ''.join(word.capitalize() for word in parts[1:])
            
            # Check if it's a scalar field (has type like String, Int, DateTime, etc.)
            # Relation fields usually point to models (e.g., ai_activity_logs[])
            is_scalar = any(t in rest for t in ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Decimal'])
            
            if is_scalar:
                # Add @map if not present
                if '@map' not in rest:
                    new_lines.append(f"  {camel_case}{spaces}{rest} @map(\"{field_name}\")\n")
                else:
                    new_lines.append(f"  {camel_case}{spaces}{rest}\n")
            else:
                # It's a relation field, no @map needed
                new_lines.append(f"  {camel_case}{spaces}{rest}\n")
        else:
            new_lines.append(line)
    else:
        new_lines.append(line)

with open('prisma/schema.prisma', 'w') as f:
    f.writelines(new_lines)

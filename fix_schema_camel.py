import re

schema_path = 'backend/prisma/schema.prisma'

with open(schema_path, 'r') as f:
    content = f.read()

# Define the models to convert from snake_case to PascalCase
model_mapping = {
    'ai_activity_logs': 'AiActivityLog',
    'ai_knowledge': 'AiKnowledge',
    'ai_prompt_versions': 'AiPromptVersion',
    'ai_review_items': 'AiReviewItem',
    'assignment_rules': 'AssignmentRule',
    'assignment_states': 'AssignmentState',
    'contact_assignment_histories': 'ContactAssignmentHistory',
    'notifications': 'Notification',
    'zalo_conversation_sync_states': 'ZaloConversationSyncState',
}

# 1. Rename relation fields that were incorrectly generated
# Replace "teams                      Team?" with "team                       Team?"
content = re.sub(r'\bteams(\s+)Team\b', r'team\1Team', content)

# Inside Conversation model, rename "zaloConversationSyncStates zalo_conversation_sync_states?" to "syncState ZaloConversationSyncState?"
content = re.sub(
    r'\bzaloConversationSyncStates(\s+)zalo_conversation_sync_states\b',
    r'syncState zalo_conversation_sync_states',
    content
)

# 2. Rename the types (both arrays and singulars) in the fields of other models
for snake, pascal in model_mapping.items():
    # Replace type array: e.g. "ai_activity_logs[]" -> "AiActivityLog[]"
    content = re.sub(rf'\b{snake}\[\]', f'{pascal}[]', content)
    # Replace singular type: e.g. "ai_activity_logs?" -> "AiActivityLog?"
    content = re.sub(rf'\b{snake}\?', f'{pascal}?', content)
    # Replace singular type: e.g. "ai_activity_logs " -> "AiActivityLog "
    content = re.sub(rf'\b{snake}(\s+)', f'{pascal}\\1', content)

# 3. Process the model blocks themselves to rename them and add @@map if missing
# We'll split the content by model definition and process each block
blocks = re.split(r'(\bmodel\s+\w+\s*\{)', content)

new_blocks = []
for i in range(len(blocks)):
    block = blocks[i]
    if i % 2 == 1:
        # This is the header of a model, e.g. "model ai_activity_logs {"
        match = re.match(r'model\s+(\w+)\s*\{', block)
        if match:
            model_name = match.group(1)
            if model_name in model_mapping:
                new_blocks.append(f"model {model_mapping[model_name]} {{")
            else:
                new_blocks.append(block)
        else:
            new_blocks.append(block)
    else:
        # This is the body of a model or the start of the file
        # Check if the preceding model was one of the renamed models
        prev_header = blocks[i-1] if i > 0 else ""
        match_prev = re.match(r'model\s+(\w+)\s*\{', prev_header)
        
        if match_prev:
            model_name = match_prev.group(1)
            if model_name in model_mapping:
                # This block is the body of a renamed model. We need to add @@map.
                # Find the closing brace of the model
                # Let's ensure @@map("model_name") is added inside before the closing brace
                if f'@@map("{model_name}")' not in block:
                    # Insert @@map before the last closing brace
                    # Let's find the last '}'
                    last_brace_idx = block.rfind('}')
                    if last_brace_idx != -1:
                        map_directive = f'\n  @@map("{model_name}")\n'
                        block = block[:last_brace_idx] + map_directive + block[last_brace_idx:]
        
        # Also clean up any field names inside that might have been snake_case
        # e.g., "ai_activity_logs ai_activity_logs[]" -> "aiActivityLogs AiActivityLog[]"
        # We can map standard snake_case field declarations inside models
        new_blocks.append(block)

content = "".join(new_blocks)

# Let's replace any instances of field names that are snake_case to camelCase
# For example, "ai_activity_logs ai_activity_logs[]" in other models should be "aiActivityLogs AiActivityLog[]"
# Let's look for "ai_activity_logs", "ai_knowledge", etc. at the start of a field line (2 spaces)
for snake, pascal in model_mapping.items():
    # Convert snake_case name to camelCase for the field name
    parts = snake.split('_')
    camel = parts[0] + ''.join(w.capitalize() for w in parts[1:])
    # Match lines like "  ai_activity_logs " and change to "  aiActivityLogs "
    content = re.sub(rf'^  {snake}(\s+)', f'  {camel}\\1', content, flags=re.MULTILINE)

with open(schema_path, 'w') as f:
    f.write(content)

print("Schema file processed successfully!")

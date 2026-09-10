import re

schema_path = 'backend/prisma/schema.prisma'

with open(schema_path, 'r') as f:
    content = f.read()

# Renaming fields in AiActivityLog
# We want to replace inside model AiActivityLog { ... }
# contacts Contact? -> contact Contact?
# conversations Conversation? -> conversation Conversation?
# users User? -> user User?
# organizations Organization -> org Organization
# aiReviewItems ai_review_items[] -> aiReviewItems AiReviewItem[]

# Let's target the AiActivityLog model block:
ai_log_pattern = r'(model\s+AiActivityLog\s*\{[\s\S]*?\})'
def fix_ai_log(match):
    block = match.group(1)
    block = re.sub(r'\bcontacts\b(\s+Contact\?)', r'contact\1', block)
    block = re.sub(r'\bconversations\b(\s+Conversation\?)', r'conversation\1', block)
    block = re.sub(r'\busers\b(\s+User\?)', r'user\1', block)
    block = re.sub(r'\borganizations\b(\s+Organization\b)', r'org\1', block)
    return block

content = re.sub(ai_log_pattern, fix_ai_log, content)

# Renaming fields in AiReviewItem
ai_review_pattern = r'(model\s+AiReviewItem\s*\{[\s\S]*?\})'
def fix_ai_review(match):
    block = match.group(1)
    block = re.sub(r'\bcontacts\b(\s+Contact\?)', r'contact\1', block)
    block = re.sub(r'\bconversations\b(\s+Conversation\?)', r'conversation\1', block)
    block = re.sub(r'\busers\b(\s+User\?)', r'user\1', block)
    block = re.sub(r'\borganizations\b(\s+Organization\b)', r'org\1', block)
    block = re.sub(r'\baiActivityLogs\b(\s+AiActivityLog\?)', r'aiActivityLog\1', block)
    return block

content = re.sub(ai_review_pattern, fix_ai_review, content)

# Renaming fields in ContactAssignmentHistory
assignment_history_pattern = r'(model\s+ContactAssignmentHistory\s*\{[\s\S]*?\})'
def fix_assignment_history(match):
    block = match.group(1)
    block = re.sub(r'\bcontacts\b(\s+Contact\b)', r'contact\1', block)
    block = re.sub(r'\busers\b(\s+User\?)', r'user\1', block)
    block = re.sub(r'\borganizations\b(\s+Organization\b)', r'org\1', block)
    return block

content = re.sub(assignment_history_pattern, fix_assignment_history, content)

# Renaming fields in Notification
notification_pattern = r'(model\s+Notification\s*\{[\s\S]*?\})'
def fix_notification(match):
    block = match.group(1)
    block = re.sub(r'\busers\b(\s+User\?)', r'user\1', block)
    block = re.sub(r'\borganizations\b(\s+Organization\b)', r'org\1', block)
    return block

content = re.sub(notification_pattern, fix_notification, content)

# Renaming fields in ZaloConversationSyncState
sync_state_pattern = r'(model\s+ZaloConversationSyncState\s*\{[\s\S]*?\})'
def fix_sync_state(match):
    block = match.group(1)
    block = re.sub(r'\bconversations\b(\s+Conversation\b)', r'conversation\1', block)
    block = re.sub(r'\bzaloAccounts\b(\s+ZaloAccount\b)', r'zaloAccount\1', block)
    block = re.sub(r'\borganizations\b(\s+Organization\b)', r'org\1', block)
    return block

content = re.sub(sync_state_pattern, fix_sync_state, content)

# Let's check for any other "organizations Organization" in the added models
# e.g., AiKnowledge, AiPromptVersion, AssignmentRule, AssignmentState
for model_name in ['AiKnowledge', 'AiPromptVersion', 'AssignmentRule', 'AssignmentState']:
    pattern = rf'(model\s+{model_name}\s*\{{[\s\S]*?\}})'
    def fix_org(match):
        block = match.group(1)
        block = re.sub(r'\borganizations\b(\s+Organization\b)', r'org\1', block)
        return block
    content = re.sub(pattern, fix_org, content)

with open(schema_path, 'w') as f:
    f.write(content)

print("Schema relations fixed!")

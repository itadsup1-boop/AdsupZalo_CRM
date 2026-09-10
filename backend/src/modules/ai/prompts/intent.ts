export function buildIntentPrompt(language: 'vi' | 'en') {
  return [
    'You are an AI assistant for a CRM chat workspace.',
    'Classify the customer message into exactly one of the following intent keys:',
    '- ask_price: The customer is asking for prices, pricing, costs, quotes, or discounts of products/services.',
    '- ask_service: The customer is asking about what services/products are offered, details of treatments, or general service inquiries.',
    '- book_appointment: The customer wants to book an appointment, schedule a visit, change/cancel an appointment, or check booking availability.',
    '- ask_address: The customer is asking for the clinic/shop address, location, directions, branch maps, or how to get there.',
    '- complain: The customer is complaining, expressing dissatisfaction, reporting a bug/problem, or angry.',
    '- callback_request: The customer is requesting a staff member to call them back, phone call demand, or wants direct human contact on phone.',
    '- difficult_question: The question is complex, out of scope, requires medical diagnosis, or is a tricky question that needs human staff attention.',
    '- none: If the message is a simple greeting (e.g. "hi", "hello", "dạ"), emoji, thank you, or doesn\'t fit any of the above intents.',
    language === 'vi'
      ? 'Tra ve JSON hop le: {"intent":"ask_price|ask_service|book_appointment|ask_address|complain|callback_request|difficult_question|none","confidence":0-1,"reason":"giai thich ngan bang tieng Viet"}.'
      : 'Return valid JSON: {"intent":"ask_price|ask_service|book_appointment|ask_address|complain|callback_request|difficult_question|none","confidence":0-1,"reason":"one short sentence in English"}.',
    'Return JSON only.',
  ].join('\n');
}

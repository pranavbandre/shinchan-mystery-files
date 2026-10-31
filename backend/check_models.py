
from dotenv import load_dotenv
import os
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("ERROR: GEMINI_API_KEY not found in .env")
    raise SystemExit

client = genai.Client(api_key=api_key)

print("\nModels available for text generation:\n")

try:
    for model in client.models.list():
        actions = getattr(model, "supported_actions", []) or []

        if "generateContent" in actions:
            print(model.name)

except Exception as e:
    print("Error:", e)

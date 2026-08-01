import os
from google import genai

# Pulls the key stored in the environment
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

def generate_local_itinerary(landmark_name: str, context: str = "") -> str:
    prompt = (
        f"Act as an expert travel companion for the 'India In Time' platform. "
        f"Generate a historical and architectural exploration guide for {landmark_name}. "
        f"Focus heavily on structural ruins, stone masonry, and ancient arches. {context}"
    )
    
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    return response.text

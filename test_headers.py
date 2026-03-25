from nanobot.providers.custom_provider import CustomProvider
import asyncio

async def test():
    prov = CustomProvider("fake", "http://fake", "fake-model")
    print("Initial custom headers:", prov._client._custom_headers)
    print("Initial httpx headers:", prov._client._client.headers)
    
    # Try updating
    try:
        prov._client._custom_headers = {**prov._client._custom_headers, "X-Test": "1"}
        print("Reassigned _custom_headers:", prov._client._custom_headers)
    except Exception as e:
        print("Failed to reassign _custom_headers:", e)

    try:
        prov._client._client.headers.update({"X-Test2": "2"})
        print("Updated httpx headers:", prov._client._client.headers)
    except Exception as e:
        print("Failed to update httpx headers:", e)

asyncio.run(test())

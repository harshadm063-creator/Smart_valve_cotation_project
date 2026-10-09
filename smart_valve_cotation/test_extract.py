import urllib.request
import json

with open("sample_customer_damper_spec.pdf", "rb") as f:
    pdf_bytes = f.read()

boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
body = (
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="file"; filename="sample_customer_damper_spec.pdf"\r\n'
    f"Content-Type: application/pdf\r\n\r\n"
).encode("utf-8") + pdf_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

req = urllib.request.Request(
    "http://127.0.0.1:8000/api/v1/specifications/extract",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
)

with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode())
    print("SUCCESS: PDF Extracted!")
    for k, v in res["extracted_fields"].items():
        print(f"  {k}: {v['value']} [{v['status']}] (confidence: {v['confidence']})")
    print("Additional Info:", res.get("additional_information", []))

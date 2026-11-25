API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)/api
AT=$(python3 -c "import json;print(json.load(open('/tmp/toks.json'))['admin+clerk_test@otoi.in']['token'])")
BT=$(python3 -c "import json;print(json.load(open('/tmp/toks.json'))['buyer+clerk_test@otoi.in']['token'])")
curl -s $API/me -H "Authorization: Bearer $AT" >/dev/null
curl -s $API/me -H "Authorization: Bearer $BT" | head -c 200; echo

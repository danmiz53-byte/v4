# Route Planner FREE v3

תיקונים לפי הפידבק שלך:
1) יותר מהיר: Resolver אחד שמנסה Photon (מהיר) ואז Nominatim רק אם צריך + Cache בדפדפן.
2) מסלול קצר ביותר: אופטימיזציה מלאה (multi-start NN + 2-opt) בלי תלות בסדר ההכנסה.
3) זיהוי קניונים/מוסדות/יישובים: Photon + Nominatim עם Bias לישראל + הוספת 'ישראל' לשאילתות (ניתן לכבות).
4) Google Maps תואם למפה: נפתח עם קואורדינטות lat,lng כדי למנוע שינוי כתובות.
5) Waze: אין multi-stop link, אז יש כפתור לכל תחנה לפי הסדר.

## Deploy
חייבים Deploy דרך Git (Import from Git), לא Drag&Drop, כדי שה-Functions יעבדו.

## ENV
מומלץ להגדיר ב-Netlify Environment variables:
APP_USER_AGENT = RoutePlannerNetlifyFree/1.0 (contact: your@email.com)

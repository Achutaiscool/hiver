# scripts/view_clusters.py
import json
from collections import defaultdict

with open('data/clustered_tweets.json') as f:
    data = json.load(f)

clusters = defaultdict(list)
for t in data:
    clusters[t['cluster_id']].append(t)

for cid in sorted(clusters.keys()):
    tweets = clusters[cid]
    print(f"\n{'='*70}")
    print(f"CLUSTER {cid} — {len(tweets)} tweets")
    print(f"{'='*70}")
    # Show 10 random tweets for context
    import random
    random.seed(42)
    sample = random.sample(tweets, min(10, len(tweets)))
    for i, t in enumerate(sample, 1):
        print(f"{i:2d}. {t['text'][:130]}")

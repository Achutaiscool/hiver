import json
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
from collections import defaultdict

# Load clustered tweets
with open('data/clustered_tweets.json') as f:
    tweets = json.load(f)

# Group by cluster
by_cluster = defaultdict(list)
for t in tweets:
    by_cluster[t['cluster_id']].append(t)

print(f"Loaded {len(tweets)} tweets across {len(by_cluster)} clusters\n")

# Re-generate embeddings (we didn't save them)
print("Re-embedding tweets (this takes ~10 seconds)...")
model = SentenceTransformer('all-MiniLM-L6-v2')

texts = [t['text_clean'] for t in tweets]
embeddings = model.encode(texts, show_progress_bar=True)

# Map tweet_id -> embedding
emb_map = {t['tweet_id']: emb for t, emb in zip(tweets, embeddings)}

# For each cluster:
#  - compute centroid (mean of embeddings in cluster)
#  - find the N tweets closest to centroid
#  - also show N random tweets for context
print("\n" + "="*80)
print("CLUSTER CENTROIDS — CORE TWEETS PER CLUSTER")
print("="*80)

N_CORE = 8      # closest to centroid
N_RANDOM = 4    # random for context

for cid in sorted(by_cluster.keys()):
    cluster_tweets = by_cluster[cid]
    cluster_embs = np.array([emb_map[t['tweet_id']] for t in cluster_tweets])
    centroid = cluster_embs.mean(axis=0)

    # Distances from each tweet to centroid
    distances = np.linalg.norm(cluster_embs - centroid, axis=1)

    # Get indices of closest tweets
    core_indices = np.argsort(distances)[:N_CORE]

    # Random sample for context
    import random
    random.seed(42)
    random_indices = random.sample(range(len(cluster_tweets)), min(N_RANDOM, len(cluster_tweets)))

    print(f"\n{'─'*80}")
    print(f"CLUSTER {cid} — {len(cluster_tweets)} tweets")
    print(f"{'─'*80}")

    print("\n🎯 CORE (closest to centroid):")
    for i, ix in enumerate(core_indices, 1):
        txt = cluster_tweets[ix]['text'][:150].replace('\n', ' ')
        print(f"  {i}. {txt}")

    print("\n🎲 RANDOM SAMPLES (for context):")
    for i, ix in enumerate(random_indices, 1):
        txt = cluster_tweets[ix]['text'][:150].replace('\n', ' ')
        print(f"  {i}. {txt}")
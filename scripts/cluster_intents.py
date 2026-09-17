import json
import re
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.manifold import TSNE
from sklearn.metrics import silhouette_score
from collections import Counter
import matplotlib.pyplot as plt
import os
import time

# ─────────────────────────────────────────────────────────
# TEXT CLEANING
# ─────────────────────────────────────────────────────────

def clean_tweet(text):
    """Remove noise from tweets for better clustering."""
    if not isinstance(text, str):
        return ""
    text = re.sub(r'@\w+', '', text)              # @mentions
    text = re.sub(r'https?://\S+', '', text)      # URLs
    text = re.sub(r'#\w+', '', text)              # hashtags
    text = re.sub(r'&\w+;', '', text)             # HTML entities
    text = re.sub(r'\d+', '', text)               # numbers
    text = text.encode('ascii', 'ignore').decode('ascii')  # emojis
    text = re.sub(r'[^\w\s]', ' ', text)          # punctuation
    text = re.sub(r'\s+', ' ', text)              # collapse spaces
    return text.lower().strip()


# ─────────────────────────────────────────────────────────
# SETUP
# ─────────────────────────────────────────────────────────

os.makedirs('data', exist_ok=True)
print("📂 Loading customer tweets...")
start_time = time.time()

# ─────────────────────────────────────────────────────────
# LOAD DATA
# ─────────────────────────────────────────────────────────

tweets = []
with open('data/raw_sample.json', 'r') as f:
    for line in f:
        if line.strip():
            row = json.loads(line)
            tweets.append(row)

print(f"✅ Loaded {len(tweets)} customer tweets")

if len(tweets) == 0:
    print("❌ ERROR: No tweets loaded.")
    raise SystemExit(1)

# ─────────────────────────────────────────────────────────
# CLEAN TEXT
# ─────────────────────────────────────────────────────────

print("\n🧹 Cleaning tweet text...")
tweet_texts_raw = [t['text'] for t in tweets]
tweet_texts_clean = [clean_tweet(t) for t in tweet_texts_raw]

valid_indices = [i for i, t in enumerate(tweet_texts_clean) if len(t) > 10]
removed_count = len(tweets) - len(valid_indices)

tweets = [tweets[i] for i in valid_indices]
tweet_texts_clean = [tweet_texts_clean[i] for i in valid_indices]

print(f"✅ Cleaned {len(tweets)} tweets (removed {removed_count} too-short)")

# ─────────────────────────────────────────────────────────
# EMBEDDINGS
# ─────────────────────────────────────────────────────────

print("\n🧠 Generating embeddings with all-MiniLM-L6-v2...")
model = SentenceTransformer('all-MiniLM-L6-v2')
embeddings = model.encode(tweet_texts_clean, show_progress_bar=True)
print(f"✅ Generated {embeddings.shape} embeddings")

# ─────────────────────────────────────────────────────────
# SVD DIMENSION REDUCTION
# ─────────────────────────────────────────────────────────

print("\n📉 Reducing dimensions with SVD (384 → 50)...")
svd = TruncatedSVD(n_components=50, random_state=42)
embeddings = svd.fit_transform(embeddings)
variance_explained = svd.explained_variance_ratio_.sum()
print(f"✅ Reduced to 50D, variance explained: {variance_explained:.2%}")

# ─────────────────────────────────────────────────────────
# FIND OPTIMAL K
# ─────────────────────────────────────────────────────────

print("\n📊 Finding optimal number of clusters...")
cluster_range = range(4, 13)
silhouette_scores = []
inertias = []

for k in cluster_range:
    print(f"  Testing {k} clusters...")
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = kmeans.fit_predict(embeddings)
    silhouette_scores.append(silhouette_score(embeddings, labels))
    inertias.append(kmeans.inertia_)

best_k = cluster_range[np.argmax(silhouette_scores)]
print(f"\n✅ Optimal clusters: {best_k} (silhouette score: {max(silhouette_scores):.4f})")

# ─────────────────────────────────────────────────────────
# FINAL CLUSTERING
# ─────────────────────────────────────────────────────────

print(f"\n📊 Clustering into {best_k} clusters...")
kmeans = KMeans(n_clusters=best_k, random_state=42, n_init=10)
clusters = kmeans.fit_predict(embeddings)

# ─────────────────────────────────────────────────────────
# ANALYZE CLUSTERS
# ─────────────────────────────────────────────────────────

print("\n📊 Cluster Analysis:")
cluster_data = {}

for cluster_id in range(best_k):
    cluster_indices = [i for i, c in enumerate(clusters) if c == cluster_id]
    cluster_tweets = [tweet_texts_clean[i] for i in cluster_indices]
    centroid = kmeans.cluster_centers_[cluster_id]
    distances = [np.linalg.norm(embeddings[i] - centroid) for i in cluster_indices]
    closest_idx = cluster_indices[np.argmin(distances)]

    cluster_data[cluster_id] = {
        'size': len(cluster_tweets),
        'representative': tweet_texts_clean[closest_idx],
        'percentage': (len(cluster_tweets) / len(tweets)) * 100
    }

    print(f"\nCluster {cluster_id}: {len(cluster_tweets)} tweets ({cluster_data[cluster_id]['percentage']:.1f}%)")
    print(f"  Example: \"{tweet_texts_clean[closest_idx][:120]}...\"")
    all_words = ' '.join(cluster_tweets).split()
    word_freq = Counter([w.lower() for w in all_words if len(w) > 3])
    common_words = word_freq.most_common(5)
    print(f"  Common words: {', '.join([w for w, _ in common_words])}")

# ─────────────────────────────────────────────────────────
# SAVE FOR LABELING
# ─────────────────────────────────────────────────────────

print("\n💾 Saving cluster assignments...")
labeled_data = []
for i, tweet in enumerate(tweets):
    labeled_data.append({
        'tweet_id': tweet['tweet_id'],
        'text': tweet['text'],
        'text_clean': tweet_texts_clean[i],
        'cluster_id': int(clusters[i]),
        'intent': '',           # YOU FILL THIS IN
        'should_escalate': None # YOU FILL THIS IN
    })

with open('data/clustered_tweets.json', 'w') as f:
    json.dump(labeled_data, f, indent=2)

print(f"✅ Saved to data/clustered_tweets.json")

# ─────────────────────────────────────────────────────────
# VISUALIZATION
# ─────────────────────────────────────────────────────────

print("\n📊 Generating visualizations...")
tsne = TSNE(n_components=2, random_state=42, perplexity=30)
embeddings_2d = tsne.fit_transform(embeddings)

plt.figure(figsize=(12, 8))
scatter = plt.scatter(embeddings_2d[:, 0], embeddings_2d[:, 1],
                      c=clusters, cmap='tab10', alpha=0.7, s=50)
plt.title(f'Tweet Clusters ({best_k} clusters)')
plt.xlabel('T-SNE 1')
plt.ylabel('T-SNE 2')
plt.colorbar(scatter, label='Cluster ID')
plt.grid(True, alpha=0.3)
plt.savefig('data/cluster_visualization.png', dpi=300, bbox_inches='tight')

fig, axes = plt.subplots(1, 2, figsize=(14, 5))
axes[0].plot(cluster_range, inertias, 'bo-', markersize=8)
axes[0].set_xlabel('k'); axes[0].set_ylabel('Inertia'); axes[0].set_title('Elbow Method')
axes[0].grid(True, alpha=0.3); axes[0].set_xticks(cluster_range)

axes[1].plot(cluster_range, silhouette_scores, 'ro-', markersize=8)
axes[1].axvline(x=best_k, color='green', linestyle='--', label=f'Best k={best_k}')
axes[1].set_xlabel('k'); axes[1].set_ylabel('Silhouette'); axes[1].set_title('Silhouette Score')
axes[1].grid(True, alpha=0.3); axes[1].set_xticks(cluster_range); axes[1].legend()

plt.tight_layout()
plt.savefig('data/silhouette_analysis.png', dpi=300, bbox_inches='tight')
print("✅ Saved visualizations")

# ─────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────

print(f"\n{'='*60}")
print(f"📊 SUMMARY")
print(f"{'='*60}")
print(f"Tweets:            {len(tweets)}")
print(f"Clusters:          {best_k}")
print(f"Silhouette:        {max(silhouette_scores):.4f}")
print(f"Variance (50D):    {variance_explained:.2%}")
print(f"Time:              {time.time() - start_time:.1f}s")
print(f"{'='*60}")

print("\n📝 NEXT: Open data/clustered_tweets.json and label 20 tweets per cluster.")

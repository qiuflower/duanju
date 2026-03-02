$ErrorActionPreference = "Stop"

$PROJECT_ID = "gen-lang-client-0324846829"
#gen-lang-client-0324846829
#gen-lang-client-0218265059
$REGION = "us-central1"
$REPO = "cloud-run-source-deploy"
$IMAGE = "duanju"
$SERVICE = "duanju"

Write-Host "Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

Write-Host "Enabling necessary services..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

Write-Host "Submitting build to Cloud Build..."
# This uploads the source (respecting .gcloudignore) and builds it using the Dockerfile
gcloud builds submit --tag "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE" .

if ($?) {
    Write-Host "Build successful."
} else {
    Write-Error "Build failed."
    exit 1
}

Write-Host "Deploying to Cloud Run..."
gcloud run deploy $SERVICE `
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE" `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --port 8080

if ($?) {
    Write-Host "Deployment successful!"
} else {
    Write-Error "Deployment failed."
    exit 1
}

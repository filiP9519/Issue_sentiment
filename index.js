import {Octokit} from "octokit";
import * as fs from "fs";
import cliProgress from "cli-progress";

const octokit = new Octokit({
    auth: 'token'
})

const projects = [
    {owner: "outline", repo: "outline" },
    {owner: "microsoft", repo: "vscode" },
    {owner: "vuejs", repo: "vue" },
    {owner: "nodejs", repo: "node" },
    {owner: "npm", repo: "cli" },
    {owner: "tailwindlabs", repo: "tailwindcss" },
    {owner: "openclaw", repo: "openclaw" },
    {owner: "nginx", repo: "nginx" },
    {owner: "mysqljs", repo: "mysql" },
    {owner: "ClickHouse", repo: "ClickHouse" },
    {owner: "grafana", repo: "grafana" },
    {owner: "prometheus", repo: "prometheus" },
    {owner: "angular", repo: "angular" },
    {owner: "react", repo: "react" },
    {owner: "yarnpkg", repo: "yarn" },
    {owner: "sveltejs", repo: "svelte" },
    {owner: "twbs", repo: "bootstrap" },
    {owner: "material-components", repo: "material-components-android" },
    {owner: "nousresearch", repo: "hermes-agent" },
    {owner: "n8n-io", repo: "n8n" }
];

// This function strips noise and leaves only the human-written text
function cleanIssueBody(body) {
    if (!body) return "";

    let cleaned = body
        // 1. Remove multiline code blocks (everything between ``` and ```)
        .replace(/```[\s\S]*?```/g, '')
        // 2. Remove inline code blocks (everything between single `)
        .replace(/`[^`]*`/g, '')
        // 3. Remove HTML tags (like <img />)
        .replace(/<[^>]*>?/gm, '')
        // 4. Remove Markdown headers (catches #, ##, ###, etc.)
        .replace(/#+.*/g, '')
        // 5. Remove checkbox lines (e.g., "- [x]" or "* [ ]")
        .replace(/(?:-|\*) [[xX ]].*/g, '')
        // 6. Remove generic placeholders
        .replace(/_No response_/g, '')
        // 7. Remove URLs
        .replace(/https?:\/\/[^\s]+/g, '')
        // 8. Strip Bold/Italic markdown asterisks but keep the text
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        .replace('')

    // Replace multiple linebreaks with a single space, and trim the edges
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}



(async () => {
    for (const project of projects) {
        console.log(`\n----------------------------------------`);
        console.log(`Starting project: ${project.owner}/${project.repo}`);
        console.log(`----------------------------------------`);

        // Initialize the progress bar (total is dynamic since GitHub doesn't expose total closed issue count upfront)
        const progressBar = new cliProgress.SingleBar({
            format: 'Fetching |{bar}| {percentage}% | {value} fetched pages/items',
            hideCursor: true
        }, cliProgress.Presets.shades_classic);

        progressBar.start(100, 0);

        const allRawIssues = [];
        let fetchedCount = 0;

        // Use paginate.iterator to fetch page-by-page so we can update the progress bar in real-time
        const iterator = octokit.paginate.iterator('GET /repos/{owner}/{repo}/issues', {
            owner: project.owner,
            repo: project.repo,
            state: 'closed',
            per_page: 100,
            sort: 'created',
            direction: 'asc',
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        for await (const response of iterator) {
            allRawIssues.push(...response.data);
            fetchedCount += response.data.length;

            // Dynamically adjust the progress bar total as pagination continues
            progressBar.update(fetchedCount, { total: fetchedCount + 100 });
        }

        progressBar.stop();
        console.log(`Downloaded ${allRawIssues.length} total raw items.`);

        const cleanDataset = allRawIssues
            .filter(item => !item.pull_request)
            .map(item => {
                const processedBody = cleanIssueBody(item.body);
                return {
                    url: item.url,
                    number: item.number,
                    state: item.state,
                    title: item.title,
                    body: processedBody,
                    // 1. Calculate length of the cleaned text to approximate complexity
                    body_length: processedBody.length,
                    // 2. Extract the integer count of comments left on the issue
                    comments: item.comments,
                    // 3. Extract just the string names from the label objects
                    labels: (item.labels || []).map(label => label.name),
                    created_at: item.created_at,
                    closed_at: item.closed_at
                };
            })
            .filter(item => item.body.length > 15);

        console.log(`Remaining pure issues after cleaning: ${cleanDataset.length}`);

        // Save findings to a dynamic filename based on owner and repo
        const filename = `${project.owner}_${project.repo}_issues_V2.jsonl`;
        const jsonlData = cleanDataset.map(item => JSON.stringify(item)).join('\n');
        fs.writeFileSync(filename, jsonlData, 'utf8');
        console.log(`Successfully saved data to ${filename}!`);

        // Fetch and print GitHub API rate limit status
        const rateLimitResponse = await octokit.rest.rateLimit.get();
        const coreLimit = rateLimitResponse.data.resources.core;
        const resetTime = new Date(coreLimit.reset * 1000).toLocaleTimeString();
        console.log(`API Rate Limit Status -> Remaining: ${coreLimit.remaining}/${coreLimit.limit} | Resets at: ${resetTime}`);

    }

    console.log(`\nAll projects completed successfully.`);



})();
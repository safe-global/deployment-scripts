import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

interface CreateIssueOptions {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
  template?: string; // Template name to use
  templateFields?: Record<string, string>; // Fields to fill in the template
}

interface IssueTemplate {
  name: string;
  filename: string;
  content: string;
  isForm: boolean;
}

/**
 * Fetches available issue templates from a GitHub repository
 * Token is optional for public repositories (read-only operation)
 */
async function fetchIssueTemplates(owner: string, repo: string): Promise<IssueTemplate[]> {
  const token = process.env.GITHUB_TOKEN;

  try {
    // Fetch templates from .github/ISSUE_TEMPLATE directory
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/.github/ISSUE_TEMPLATE`;
    
    const headers: Record<string, string> = {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Safe-Deployments-Scripts",
    };
    
    // Add authorization header if token is available (increases rate limits)
    if (token) {
      headers["Authorization"] = `token ${token}`;
    }
    
    const response = await fetch(url, { headers });

    if (!response.ok) {
      // Templates directory might not exist, return empty array
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch templates: ${response.status} ${response.statusText}`);
    }

    const files = await response.json() as any[];
    const templates: IssueTemplate[] = [];

    for (const file of files) {
      if (file.type === "file" && (file.name.endsWith(".md") || file.name.endsWith(".yml") || file.name.endsWith(".yaml"))) {
        // Fetch template content
        const contentHeaders: Record<string, string> = {
          "User-Agent": "Safe-Deployments-Scripts",
        };
        if (token) {
          contentHeaders["Authorization"] = `token ${token}`;
        }
        
        const contentResponse = await fetch(file.download_url, {
          headers: contentHeaders,
        });

        if (contentResponse.ok) {
          const content = await contentResponse.text();
          const isForm = file.name.endsWith(".yml") || file.name.endsWith(".yaml");
          
          templates.push({
            name: file.name.replace(/\.(md|yml|yaml)$/, ""),
            filename: file.name,
            content,
            isForm,
          });
          
          // Debug: Log if this is the template we're looking for
          if (file.name.includes("add_safe_address_new_chain") || file.name.includes("new_chain")) {
            console.log(`🔍 Template content preview (first 500 chars):\n${content.substring(0, 500)}`);
            const labelsInContent = content.match(/labels:\s*\[([^\]]+)\]/m);
            console.log(`🔍 Labels found in template:`, labelsInContent ? labelsInContent[1] : 'NONE');
          }
        }
      }
    }

    return templates;
  } catch (error: any) {
    console.warn(`Warning: Could not fetch templates: ${error.message}`);
    return [];
  }
}

/**
 * Formats issue body for GitHub form templates
 * GitHub form templates use field IDs that need to be matched to form inputs
 */
function formatFormBody(templateBody: string, fields: Record<string, string>): string {
  let formattedBody = templateBody;
  
  // Field ID mappings: field ID -> label patterns to match in template
  // These match the field IDs from the GitHub form template
  const fieldMappings: Record<string, string[]> = {
    'summary': ['Summary'],
    'chain_id': ['Chain ID'],
    'chain_ir_url': ['Chain detail URL', 'Chain detail URL'],
    'rpc_url': ['RPC URL'],
    'blockscout_client_url': ['Blockscout Client URL'],
    'etherscan_client_url': ['Etherscan Client V1 URL'],
    'etherscan_client_api_url': ['Etherscan Client V1 API URL'],
    'version': ['Version'],
    'address_master_copy': ['Address \\(Master copy\\)'],
    'tx_hash_master_copy': ['Deployment Tx hash \\(Master copy\\)'],
    'block_explorer_url_master_copy': ['Block explorer URL \\(Master copy\\)'],
    'address_master_copy_l2': ['Address \\(Master copy L2\\)'],
    'tx_hash_master_copy_l2': ['Deployment Tx hash \\(Master copy L2\\)'],
    'block_explorer_url_master_copy_l2': ['Block explorer URL \\(Master copy L2\\)'],
    'address_proxy': ['Address \\(Proxy factory\\)'],
    'tx_hash_proxy': ['Deployment Tx hash \\(Proxy factory\\)'],
    'block_explorer_url_proxy': ['Block explorer URL \\(Proxy factory\\)'],
  };
  
  // For GitHub form templates, we need to fill in the form fields by matching field IDs
  // The template body contains form field definitions, and we need to insert values after the field labels
  
  // Process each field
  for (const [fieldId, value] of Object.entries(fields)) {
    if (!value || value.trim() === '') continue; // Skip empty values
    
    // Get label patterns for this field ID
    const labelPatterns = fieldMappings[fieldId] || [];
    
    // Try to match and replace for each label pattern
    for (const labelPattern of labelPatterns) {
      // Pattern 1: Match "label: Label Name\n    placeholder: ex. example" and replace placeholder
      const pattern1 = new RegExp(`(label:\\s*${labelPattern}[^\\n]*\\n[^\\n]*placeholder:\\s*ex\\.\\s*)[^\\n]+`, 'gi');
      if (pattern1.test(formattedBody)) {
        formattedBody = formattedBody.replace(pattern1, `$1${value}`);
        continue;
      }
      
      // Pattern 2: Match "label: Label Name\n    placeholder: {placeholder}" and replace
      const pattern2 = new RegExp(`(label:\\s*${labelPattern}[^\\n]*\\n[^\\n]*placeholder:\\s*\\{)[^}]+(\\})`, 'gi');
      if (pattern2.test(formattedBody)) {
        formattedBody = formattedBody.replace(pattern2, `$1${value}$2`);
        continue;
      }
    }
    
    // Also try to find the field by its ID in the YAML structure
    // Match patterns like: "id: field_id\n    attributes:\n      placeholder: ex. example"
    const idPattern = new RegExp(`(id:\\s*${fieldId.replace(/_/g, '_')}[^\\n]*\\n[^\\n]*attributes:[^\\n]*\\n[^\\n]*placeholder:\\s*ex\\.\\s*)[^\\n]+`, 'gi');
    if (idPattern.test(formattedBody)) {
      formattedBody = formattedBody.replace(idPattern, `$1${value}`);
      continue;
    }
  }
  
  // For textarea fields (like summary), we need to handle them differently
  // GitHub form templates render textarea values directly in the body
  // We'll replace placeholder patterns in the rendered form body
  for (const [fieldId, value] of Object.entries(fields)) {
    if (!value || value.trim() === '') continue;
    
    // Try to match rendered form patterns: "### Field Label\n\nplaceholder text"
    const labelPatterns = fieldMappings[fieldId] || [];
    for (const labelPattern of labelPatterns) {
      // Match "### Label\n\nplaceholder" or "**Label**\n\nplaceholder"
      const renderedPattern = new RegExp(`(###\\s+${labelPattern}|\\*\\*${labelPattern}\\*\\*)[^\\n]*\\n\\n[^\\n]*(?:ex\\.\\s*|placeholder:)[^\\n]*`, 'gi');
      if (renderedPattern.test(formattedBody)) {
        formattedBody = formattedBody.replace(renderedPattern, `$1\n\n${value}`);
      }
    }
  }
  
  return formattedBody;
}

/**
 * Builds a GitHub form template body in the exact format GitHub expects
 * When a form template is submitted, GitHub creates markdown like:
 * 
 * ### Field Label
 * 
 * Field Value
 * 
 * This function parses the YAML template and builds ONLY the formatted markdown output
 */
function buildFormBody(templateContent: string, fields: Record<string, string>): string {
  const sections: string[] = [];
  
  // Extract the body section from the YAML template
  let bodyContent = templateContent;
  
  // Remove YAML frontmatter if present (everything between --- markers)
  const frontmatterMatch = templateContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (frontmatterMatch) {
    bodyContent = frontmatterMatch[2]; // Get content after frontmatter
  }
  
  // Extract body: section - everything after "body:"
  const bodyMatch = bodyContent.match(/^body:\s*\n([\s\S]*)$/m);
  if (bodyMatch) {
    bodyContent = bodyMatch[1];
  }
  
  // Parse YAML array items - each field starts with "- type:"
  // We need to match the full structure including proper YAML indentation
  const lines = bodyContent.split('\n');
  let i = 0;
  
  interface TemplateItem {
    type: string;
    id?: string;
    label?: string;
    markdownContent?: string;
    order: number;
  }
  
  const items: TemplateItem[] = [];
  let order = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if this is the start of a new field/item
    if (trimmed.startsWith('- type:')) {
      const typeMatch = trimmed.match(/- type:\s+(\w+)/);
      if (!typeMatch) {
        i++;
        continue;
      }
      
      const fieldType = typeMatch[1];
      let fieldId: string | undefined;
      let fieldLabel: string | undefined;
      let markdownValue: string | undefined;
      let inAttributes = false;
      let inValueBlock = false;
      const valueLines: string[] = [];
      
      // Parse this field definition
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trim();
        
        // Check if we've reached the next field
        if (nextTrimmed.startsWith('- type:')) {
          break;
        }
        
        // Check for id
        if (nextTrimmed.startsWith('id:')) {
          fieldId = nextTrimmed.replace(/id:\s+/, '').trim();
        }
        
        // Check for attributes section
        if (nextTrimmed === 'attributes:') {
          inAttributes = true;
        }
        
        // Check for label (must be inside attributes)
        if (inAttributes && nextTrimmed.startsWith('label:')) {
          fieldLabel = nextTrimmed.replace(/label:\s+/, '').trim();
        }
        
        // Check for markdown value block
        if (fieldType === 'markdown' && nextTrimmed === 'value: |') {
          inValueBlock = true;
          i++;
          // Collect the value block (indented content)
          while (i < lines.length) {
            const valueLine = lines[i];
            // Check if we've hit the next field or end of block
            if (valueLine.trim().startsWith('- type:') || 
                (valueLine.trim() === '' && i + 1 < lines.length && lines[i + 1].trim().startsWith('- type:'))) {
              i--; // Back up one line
              break;
            }
            // Remove YAML indentation (at least 8 spaces for nested content)
            const cleaned = valueLine.replace(/^\s{8,}/, '');
            valueLines.push(cleaned);
            i++;
          }
          markdownValue = valueLines.join('\n').trim();
          continue;
        }
        
        i++;
      }
      
      // Add the item
      if (fieldType === 'markdown' && markdownValue) {
        items.push({
          type: 'markdown',
          markdownContent: markdownValue,
          order: order++
        });
      } else if (fieldId && fieldLabel && fieldType !== 'markdown') {
        items.push({
          type: fieldType,
          id: fieldId,
          label: fieldLabel,
          order: order++
        });
      }
      
      continue;
    }
    
    i++;
  }
  
  // Build the markdown body in order
  for (const item of items) {
    if (item.type === 'markdown' && item.markdownContent) {
      sections.push(item.markdownContent);
    } else if (item.id && item.label && item.type !== 'markdown') {
      const value = fields[item.id];
      // Include field if it exists in fields (even if empty string)
      // Skip only if value is undefined/null (field not provided)
      if (value !== undefined && value !== null) {
        // Include the field - empty strings are valid for optional fields
        sections.push(`### ${item.label}\n\n${value}`);
      }
    }
  }
  
  return sections.join('\n\n');
}

/**
 * Fills template fields in the issue body
 */
function fillTemplateFields(body: string, fields: Record<string, string>): string {
  let filledBody = body;
  
  // Replace placeholders like {{field_name}} or [field_name]
  for (const [key, value] of Object.entries(fields)) {
    // Replace {{key}} or {{ key }}
    filledBody = filledBody.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value);
    // Replace [key] placeholders
    filledBody = filledBody.replace(new RegExp(`\\[${key}\\]`, 'g'), value);
    // Replace common markdown template placeholders
    filledBody = filledBody.replace(new RegExp(`<!--\\s*${key}\\s*-->[\\s\\S]*?<!--\\s*/${key}\\s*-->`, 'g'), value);
  }
  
  return filledBody;
}

/**
 * Creates a GitHub issue using the GitHub REST API
 * Returns the created issue object
 */
export async function createGitHubIssue(options: CreateIssueOptions): Promise<any> {
  const { owner, repo, title, body, labels, assignees, milestone, template, templateFields } = options;

  // Get GitHub token from environment (optional - will try without token first)
  const token = process.env.GITHUB_TOKEN;

  let issueBody = body;
  // Preserve explicitly provided labels - they take precedence
  let issueLabels = labels && labels.length > 0 ? labels : undefined;
  let issueAssignees = assignees;

  console.log(`🏷️  Initial labels:`, issueLabels);

  // If template is specified, fetch and use it
  if (template) {
    console.log(`📋 Fetching issue template: ${template}...`);
    const templates = await fetchIssueTemplates(owner, repo);
    const selectedTemplate = templates.find(t => 
      t.name.toLowerCase() === template.toLowerCase() || 
      t.filename.toLowerCase() === template.toLowerCase() ||
      t.filename.toLowerCase().includes(template.toLowerCase())
    );

    if (!selectedTemplate) {
      console.warn(`⚠️  Template "${template}" not found. Available templates:`);
      templates.forEach(t => console.warn(`   - ${t.name} (${t.filename})`));
      if (templates.length === 0) {
        console.warn(`   No templates found in .github/ISSUE_TEMPLATE directory.`);
      }
      console.warn(`   Using provided body as-is.`);
    } else {
      console.log(`✅ Found template: ${selectedTemplate.filename}`);
      // Extract body from template (remove YAML frontmatter if present)
      // GitHub form templates don't use --- markers, they have YAML at the top level
      const yamlMatch = selectedTemplate.content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
      let frontmatter = '';
      if (yamlMatch) {
        frontmatter = yamlMatch[1];
        issueBody = yamlMatch[2];
      } else {
        // No --- markers, so the entire content is YAML (form template)
        // Extract frontmatter (everything before "body:")
        const bodyMatch = selectedTemplate.content.match(/^([\s\S]*?)body:\s*\n([\s\S]*)$/);
        if (bodyMatch) {
          frontmatter = bodyMatch[1];
          issueBody = bodyMatch[2];
        } else {
          issueBody = selectedTemplate.content;
        }
      }
      
      // Extract labels and assignees from template ONLY if not explicitly provided
      // Explicitly provided labels take precedence
      if (!issueLabels) {
        console.log(`🔍 Searching for labels in template content...`);
        // Try array syntax: labels: ["label1", "label2"]
        const labelsArrayMatch = selectedTemplate.content.match(/labels:\s*\[([^\]]+)\]/m);
        if (labelsArrayMatch) {
          issueLabels = labelsArrayMatch[1]
            .split(',')
            .map(l => l.trim().replace(/^["']|["']$/g, ''))
            .filter(l => l.length > 0);
          console.log(`📌 Extracted labels from template (array syntax): ${issueLabels.join(', ')}`);
        } else {
          // Try list syntax: labels:\n  - label1\n  - label2
          const labelsListMatch = selectedTemplate.content.match(/labels:\s*\n((?:\s*-\s*[^\n]+\n?)+)/m);
          if (labelsListMatch) {
            issueLabels = labelsListMatch[1].split('\n').filter(l => l.trim()).map(l => l.replace(/^\s*-\s*/, '').trim());
            console.log(`📌 Extracted labels from template (list syntax): ${issueLabels.join(', ')}`);
          } else {
            console.warn(`⚠️  No labels found in template. Searching in content...`);
            console.warn(`⚠️  Template content preview: ${selectedTemplate.content.substring(0, 500)}`);
            // Try one more time with a more flexible regex
            const flexibleMatch = selectedTemplate.content.match(/labels:\s*(\[[^\]]+\]|.*)/m);
            if (flexibleMatch) {
              console.warn(`⚠️  Found potential labels line: ${flexibleMatch[0]}`);
            }
          }
        }
      } else {
        console.log(`📌 Using provided labels: ${issueLabels.join(', ')}`);
      }
      
      if (!issueAssignees) {
        const assigneesMatch = selectedTemplate.content.match(/^assignees:\s*\n((?:\s*-\s*[^\n]+\n?)+)/m);
        if (assigneesMatch) {
          issueAssignees = assigneesMatch[1].split('\n').filter(a => a.trim()).map(a => a.replace(/^\s*-\s*/, '').trim());
        }
      }
    }
  }

  // Fill template fields if provided
  if (templateFields && Object.keys(templateFields).length > 0) {
    // Check if this is a form template
    if (template) {
      const templates = await fetchIssueTemplates(owner, repo);
      const selectedTemplate = templates.find(t => 
        t.name.toLowerCase() === template.toLowerCase() || 
        t.filename.toLowerCase() === template.toLowerCase() ||
        t.filename.toLowerCase().includes(template.toLowerCase())
      );
      
      if (selectedTemplate?.isForm) {
        // For GitHub form templates, always use buildFormBody to create the proper format
        // GitHub form templates render as markdown with field labels and values
        issueBody = buildFormBody(selectedTemplate.content, templateFields);
      } else {
        // Use regular template field filling
        issueBody = formatFormBody(issueBody, templateFields);
      }
    } else {
      // Use regular template field filling
      issueBody = formatFormBody(issueBody, templateFields);
    }
  }

  // GitHub API endpoint
  const url = `https://api.github.com/repos/${owner}/${repo}/issues`;

  // Prepare request body (without labels - we'll add them separately via API)
  const requestBody: any = {
    title,
    body: issueBody,
  };

  // Note: Labels will be added after issue creation using the labels API endpoint
  if (issueLabels && issueLabels.length > 0) {
    console.log(`🏷️  Will add labels after issue creation: ${issueLabels.join(', ')}`);
  } else {
    console.warn(`⚠️  No labels to add to issue. issueLabels value:`, issueLabels);
  }

  if (issueAssignees && issueAssignees.length > 0) {
    requestBody.assignees = issueAssignees;
  }

  if (milestone) {
    requestBody.milestone = milestone;
  }

  // Prepare headers (token is optional - GitHub API free tier supports both read and write)
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "Safe-Deployments-Scripts",
  };
  
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}\n${errorText}`
      );
    }

    const issue = await response.json() as any;
    console.log(`✅ Successfully created issue #${issue.number}`);
    console.log(`   Title: ${issue.title}`);
    console.log(`   URL: ${issue.html_url}`);
    
    // Add labels after issue creation using the labels API endpoint
    if (issueLabels && issueLabels.length > 0) {
      try {
        const labelsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issue.number}/labels`;
        const labelsResponse = await fetch(labelsUrl, {
          method: "POST",
          headers: {
            "Accept": "application/vnd.github+json",
            "Authorization": token ? `token ${token}` : "",
            "Content-Type": "application/json",
            "User-Agent": "Safe-Deployments-Scripts",
          },
          body: JSON.stringify({
            labels: issueLabels
          }),
        });
        
        if (labelsResponse.ok) {
          const labelsResult = await labelsResponse.json() as any[];
          console.log(`🏷️  Successfully added labels: ${labelsResult.map(l => l.name).join(', ')}`);
        } else {
          const errorText = await labelsResponse.text();
          console.warn(`⚠️  Failed to add labels: ${labelsResponse.status} ${labelsResponse.statusText}`);
          console.warn(`   Error: ${errorText}`);
        }
      } catch (labelError: any) {
        console.warn(`⚠️  Error adding labels: ${labelError.message}`);
      }
    }
    
    return issue;
  } catch (error: any) {
    console.error("❌ Failed to create GitHub issue:");
    console.error(error.message);
    throw error;
  }
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.error("Usage: tsx create-github-issue.ts <owner> <repo> <title> <body> [options]");
    console.error("\nOptions:");
    console.error("  --template <name>        Use a specific issue template");
    console.error("  --field <key>=<value>    Fill template field (can be used multiple times)");
    console.error("  --label <label>         Add label (can be used multiple times)");
    console.error("\nExamples:");
    console.error('  # Basic usage:');
    console.error('  tsx create-github-issue.ts safe-global safe-eth-py "Deployment Complete" "Contracts deployed"');
    console.error('');
    console.error('  # With template:');
    console.error('  tsx create-github-issue.ts safe-global safe-eth-py "Bug Report" "..." --template bug_report');
    console.error('');
    console.error('  # With template fields:');
    console.error('  tsx create-github-issue.ts safe-global safe-eth-py "New Chain" "..." --template new_chain --field chain_name=Sepolia --field chain_id=11155111');
    console.error('');
    console.error('  # List available templates:');
    console.error('  tsx create-github-issue.ts safe-global safe-eth-py --list-templates');
    console.error("\nEnvironment variables:");
    console.error("  GITHUB_TOKEN - GitHub personal access token (required for creating issues, optional for listing templates)");
    process.exit(1);
  }

  // Check for --list-templates flag
  if (args.includes("--list-templates")) {
    const owner = args[0];
    const repo = args[1];
    try {
      // Token is optional for listing templates from public repos
      const templates = await fetchIssueTemplates(owner, repo);
      if (templates.length === 0) {
        console.log("No issue templates found in this repository.");
      } else {
        console.log(`Found ${templates.length} issue template(s):\n`);
        templates.forEach(t => {
          console.log(`  📋 ${t.name}`);
          console.log(`     File: ${t.filename}`);
          console.log(`     Type: ${t.isForm ? "YAML Form" : "Markdown Template"}`);
          console.log("");
        });
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  const owner = args[0];
  const repo = args[1];
  const title = args[2];
  const body = args[3];
  
  // Parse options
  let template: string | undefined;
  const templateFields: Record<string, string> = {};
  const labels: string[] = [];
  
  for (let i = 4; i < args.length; i++) {
    if (args[i] === "--template" && i + 1 < args.length) {
      template = args[++i];
    } else if (args[i] === "--field" && i + 1 < args.length) {
      const field = args[++i];
      const [key, ...valueParts] = field.split("=");
      if (key && valueParts.length > 0) {
        templateFields[key] = valueParts.join("=");
      }
    } else if (args[i] === "--label" && i + 1 < args.length) {
      labels.push(args[++i]);
    } else if (!args[i].startsWith("--")) {
      // Legacy support: remaining args are labels
      labels.push(args[i]);
    }
  }

  // If body is a file path (starts with @), read from file
  let issueBody = body;
  if (body.startsWith("@")) {
    const filePath = body.substring(1);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    issueBody = fs.readFileSync(filePath, "utf-8");
  }

  try {
    await createGitHubIssue({
      owner,
      repo,
      title,
      body: issueBody,
      template,
      templateFields: Object.keys(templateFields).length > 0 ? templateFields : undefined,
      labels: labels.length > 0 ? labels : undefined,
    });
  } catch (error) {
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports=xenosearch;

function max(a,b){
    return a>b?a:b;
}

function min(a,b){
    return a<b?a:b;
}

function lcs(a,b){
    let dp=[];
    let temp=[];
    for(i=0;i<=a.length;i++){
        temp=[];
        for(j=0;j<=b.length;j++){
            temp.push(0);
        }
        dp.push(temp);
    }
    for(i=0;i<=a.length;i++){
        for(j=0;j<=b.length;j++){
            if(i==0 || j==0){
                dp[i][j]=0;
            }
            else if(a[i-1]==b[j-1]){
                dp[i][j]=dp[i-1][j-1]+1;
            }
            else{
                dp[i][j]=max(dp[i-1][j],dp[i][j-1]);
            }
        }
    }
    return dp[a.length][b.length]/min(a.length,b.length);
}

function prefix_matching_from_start(a,b){
    let i=0;
    for(i=0;i<min(a.length,b.length);i++){
        if(a[i]!=b[i]){
            break;
        }
    }
    return i/min(a.length,b.length);
}

function prefix_matching_from_middle(a,b){
    if(a.length>b.length){
        temp=a;
        a=b;
        b=temp;
    }
    let i=0;
    for(i=0;i<a.length;i++){
        if(a[i]!=b[b.length-a.length+i]){
            break;
        }
    }
    return i/min(a.length,b.length);
}

function suffix_matching_from_middle(a,b){
    let i=min(a.length,b.length)-1;
    for(;i>=0;i--){
        if(a[i]!=b[i]){
            break;
        }
    }
    return (min(a.length,b.length)-i-1)/min(a.length,b.length);
}

function suffix_matching_from_end(a,b){
    if(a.length>b.length){
        temp=a;
        a=b;
        b=temp;
    }
    let i=0;
    for(i=b.length-1;i>=b.length-a.length;i--){
        if(a[i-b.length+a.length]!=b[i]){
            break;
        }
    }
    return (max(a.length,b.length)-i-1)/min(a.length,b.length);
}


function sortFunction(a, b) {
    if (a[2] === b[2]) {
        return 0;
    }
    else {
        return (a[2] < b[2]) ? 1 : -1;
    }
}

function xenosearch(array,query,number_of_output){
    let score=[];
    query=query.trim();
    array.forEach((body)=>{
        body[1]=body[1].trim();
        body.push(lcs(body[1],query)+suffix_matching_from_end(body[1],query)+prefix_matching_from_start(body[1],query)+suffix_matching_from_middle(body[1],query)+prefix_matching_from_middle(body[1],query));
    });
    array.sort(sortFunction);
    return array;
}
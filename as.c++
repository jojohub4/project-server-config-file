#include <iostream>
using namespace std;

// Definition for a Binary Tree Node
struct Node {
    int data;
    Node* left;
    Node* right;
    
    Node(int val) {
        data = val;
        left = right = nullptr;
    }
};

// Recursive function to print ancestors of a given key
bool printAncestors(Node* root, int key) {
    if (root == nullptr) return false;

    // If the key is found, return true
    if (root->data == key) return true;

    // If the key is in the left or right subtree, print current node
    if (printAncestors(root->left, key) || printAncestors(root->right, key)) {
        cout << root->data << " ";
        return true;
    }

    return false;
}

int main() {
    // Constructing the given binary tree
    Node* root = new Node(1);
    root->left = new Node(2);
    root->right = new Node(3);
    root->left->left = new Node(4);
    root->left->right = new Node(5);
    root->left->left->left = new Node(7);

    int key;
    cout << "Enter the key: ";
    cin >> key;

    cout << "Ancestors of " << key << ": ";
    if (!printAncestors(root, key))
        cout << "No ancestors found (key not in tree)";
    
    cout << endl;
    return 0;
}
